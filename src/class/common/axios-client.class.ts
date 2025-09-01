import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { IStandardResponseBody, IErrorResponseBody } from "../../interfaces/transport.interface";
import logger from "../../logging";
import { APP_ERROR_CODE } from "../../enums/error-codes.enum";
import { toStandardResponse, handleError } from "../../utils/response-utils";
import { Response, ResponseStatus } from "./response.class";
import LoggingTags from "../../enums/logging-tags.enum";

/**
 * AxiosClient - Singleton class for managing HTTP requests
 *
 * This class provides a centralized Axios instance with:
 * - Singleton pattern ensuring one instance throughout the application
 * - Consistent error handling
 * - Response transformation
 * - Request logging
 *
 * All HTTP requests in the chatbot service should use this client
 * to ensure consistent behavior and error handling.
 */
export default class AxiosClient {
  private static instance: AxiosInstance;
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static pendingRequests: Map<string, boolean> = new Map();

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  /**
   * Test helper: reset the internal singleton instance and pending requests map.
   * This should only be used in test setups to avoid leaking state between tests.
   */
  public static resetForTests(): void {
    // remove interceptors by dropping the instance

    (AxiosClient as any).instance = undefined;
    AxiosClient.pendingRequests = new Map();
  }

  /**
   * Returns the singleton Axios instance, creating it if it doesn't exist
   *
   * @param config - Optional Axios configuration to override defaults
   * @returns The shared Axios instance
   *
   * @example
   * // Get default instance
   * const axiosInstance = AxiosClient.getInstance();
   *
   * @example
   * // Get instance with custom config
   * const axiosInstance = AxiosClient.getInstance({
   *   baseURL: 'https://api.example.com',
   *   timeout: 5000,
   *   headers: { 'Authorization': 'Bearer token123' }
   * });
   */
  public static getInstance(config?: AxiosRequestConfig): AxiosInstance {
    if (!AxiosClient.instance) {
      AxiosClient.instance = axios.create({
        timeout: this.DEFAULT_TIMEOUT,
        headers: { "Content-Type": "application/json" },
        ...config,
      });

      // Add response interceptor
      AxiosClient.instance.interceptors.response.use(
        (response) => AxiosClient.handleResponse(response),
        (error) => AxiosClient.handleError(error)
      );

      // Add request interceptor for logging and tracking
      AxiosClient.instance.interceptors.request.use(
        (config) => {
          const requestId = `${config.method}-${config.url}`;
          this.pendingRequests.set(requestId, true);
          logger.info(`${config.method?.toUpperCase()} ${config.url} (${ResponseStatus.PENDING})`, "AxiosClient.requestInterceptor", LoggingTags.API_REQUEST);
          return config;
        },
        (error) => {
          logger.error(error, "AxiosClient.requestInterceptor", LoggingTags.API_REQUEST);
          return Promise.reject(error);
        }
      );
    }
    return AxiosClient.instance;
  }

  /**
   * Handles successful API responses
   */
  private static handleResponse<T>(response: AxiosResponse): AxiosResponse<T> {
    const requestId = `${response.config.method}-${response.config.url}`;
    this.pendingRequests.delete(requestId);

    logger.info(`${response.status} ${response.config.url} (${ResponseStatus.SUCCESS})`, "AxiosClient.handleResponse", LoggingTags.API_RESPONSE);

    // You can transform the response here if needed
    return response;
  }

  /**
   * Handles API errors and transforms them into standard Response objects
   */
  private static handleError(error: AxiosError): Promise<never> {
    if (error.config) {
      const requestId = `${error.config.method}-${error.config.url}`;
      this.pendingRequests.delete(requestId);
    }

    logger.error(`API Error (${ResponseStatus.ERROR})`, "AxiosClient.handleError", LoggingTags.API_RESPONSE);

    // Use the imported handleError function to create standardized error response
    return Promise.reject(handleError(error, "AxiosClient.handleError"));
  }

  /**
   * Constructs a standardized error response from an Axios error
   *
   * @param error - The error object (Axios error or other error)
   * @returns A standardized error response object
   *
   * @example
   * try {
   *   const response = await someApiCall();
   *   // process response
   * } catch (error) {
   *   const errorResponse = AxiosClient.constructErrorDataFromAxiosError(error);
   *   console.log(errorResponse.msg); // Error message
   *   console.log(errorResponse.appErrorCode); // Application error code
   * }
   */
  public static constructErrorDataFromAxiosError(error: unknown): IErrorResponseBody {
    try {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        const status = axiosError.response?.status;

        // Unauthorized
        if (status === 401) {
          return {
            success: false,
            msg: "Unauthorized request.",
            appErrorCode: APP_ERROR_CODE.UNAUTHORIZED,
            errorMessage: "Unauthorized request.",
            payload: axiosError,
            errorObject: axiosError,
          };
        }

        // Bad request
        if (status === 400) {
          return {
            success: false,
            msg: `Bad request: ${axiosError.message}`,
            appErrorCode: APP_ERROR_CODE.BAD_REQUEST,
            errorMessage: `Bad request: ${axiosError.message}`,
            payload: axiosError,
            errorObject: axiosError,
          };
        }

        // Server error
        if (status === 500) {
          return {
            success: false,
            msg: `Server error: ${axiosError.message}`,
            appErrorCode: APP_ERROR_CODE.SERVER_ERROR,
            errorMessage: `Server error: ${axiosError.message}`,
            payload: axiosError,
            errorObject: axiosError,
          };
        }

        // Network error
        if (axiosError.code === "ECONNABORTED" || axiosError.code === "ERR_NETWORK") {
          return {
            success: false,
            msg: `Network error: ${axiosError.message}`,
            appErrorCode: APP_ERROR_CODE.NETWORK_ERROR,
            errorMessage: `Network error: ${axiosError.message}`,
            payload: axiosError,
            errorObject: axiosError,
          };
        }

        // Default unknown error for Axios errors
        return {
          success: false,
          msg: `Unknown error: ${axiosError.message}`,
          appErrorCode: APP_ERROR_CODE.UNKNOWN_ERROR,
          errorMessage: `Unknown error: ${axiosError.message}`,
          payload: axiosError,
          errorObject: axiosError,
        };
      }

      // Handle non-Axios errors
      const isErrorInstance = error instanceof Error;
      const errorMsg = isErrorInstance ? (error as Error).message : `Unknown error: ${JSON.stringify(error)}`;

      return {
        success: false,
        msg: errorMsg,
        appErrorCode: APP_ERROR_CODE.UNKNOWN_ERROR,
        errorMessage: errorMsg,
        payload: error,
        errorObject: error,
      };
    } catch (catchError) {
      logger.error(`Error in constructErrorDataFromAxiosError: ${catchError}`, "AxiosClient.constructErrorDataFromAxiosError", LoggingTags.ERROR);

      const isErrorInstance = catchError instanceof Error;
      const errorMsg = `Failed to process error: ${isErrorInstance ? (catchError as Error).message : JSON.stringify(catchError)}`;

      return {
        success: false,
        msg: errorMsg,
        appErrorCode: APP_ERROR_CODE.UNKNOWN_ERROR,
        errorMessage: errorMsg,
        payload: catchError,
        errorObject: catchError,
      };
    }
  }

  /**
   * Checks if a request is currently pending
   *
   * @param method - HTTP method of the request (get, post, etc.)
   * @param url - URL of the request
   * @returns True if the request is pending, false otherwise
   *
   * @example
   * // Check if a GET request to /users is currently in progress
   * if (AxiosClient.isRequestPending('get', '/users')) {
   *   console.log('Request is already in progress');
   *   return; // Avoid duplicate request
   * }
   */
  public static isRequestPending(method: string, url: string): boolean {
    return this.pendingRequests.has(`${method}-${url}`);
  }

  /**
   * Converts a Response object to the standard response format
   */
  private static toStandardResponse<T = unknown>(response: Response): IStandardResponseBody<T> {
    // Use the imported toStandardResponse function
    return toStandardResponse<T>(response);
  }

  /**
   * Generic method to handle all HTTP requests
   */
  private static async request<T>(
    method: "get" | "post" | "put" | "delete" | "patch",
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<IStandardResponseBody<T>> {
    try {
      // Initialize response variable with a dummy value that will be overwritten
      let response: AxiosResponse<T> | null = null;

      if (method === "get") {
        response = await this.getInstance().get<T>(url, config);
      }

      if (method === "post") {
        response = await this.getInstance().post<T>(url, data, config);
      }

      if (method === "put") {
        response = await this.getInstance().put<T>(url, data, config);
      }

      if (method === "delete") {
        response = await this.getInstance().delete<T>(url, config);
      }

      if (method === "patch") {
        response = await this.getInstance().patch<T>(url, data, config);
      }

      // Check if a response was set by one of the if conditions
      if (!response) {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }

      // Now response is guaranteed to be defined
      return {
        success: true,
        msg: "Request successful",
        payload: response.data,
      };
    } catch (error) {
      if (error instanceof Response) {
        return this.toStandardResponse<T>(error);
      }

      // If it's not already a Response object, create one
      const errorMessage = error instanceof Error ? error.message : "Request failed";
      const errorResponse = new Response({
        content: errorMessage,
        status: ResponseStatus.ERROR,
        metadata: { error },
      });

      return this.toStandardResponse<T>(errorResponse);
    }
  }

  /**
   * Makes a GET request with standardized response format
   *
   * @param url - The URL to send the request to
   * @param config - Optional Axios request configuration
   * @returns Promise resolving to a standardized response with payload of type T
   *
   * @example
   * // Basic GET request
   * const response = await AxiosClient.get<User[]>('/users');
   * if (response.success) {
   *   const users = response.payload; // Type: User[]
   *   console.log(`Retrieved ${users.length} users`);
   * } else {
   *   console.error(`Error: ${response.msg}`);
   * }
   *
   * @example
   * // GET with query parameters and custom headers
   * const response = await AxiosClient.get<User>('/users/1', {
   *   params: { include: 'profile' },
   *   headers: { 'Cache-Control': 'no-cache' }
   * });
   */
  public static async get<T>(url: string, config?: AxiosRequestConfig): Promise<IStandardResponseBody<T>> {
    return this.request<T>("get", url, undefined, config);
  }

  /**
   * Makes a POST request with standardized response format
   *
   * @param url - The URL to send the request to
   * @param data - The data to send in the request body
   * @param config - Optional Axios request configuration
   * @returns Promise resolving to a standardized response with payload of type T
   *
   * @example
   * // Basic POST request
   * const newUser = { name: 'John Doe', email: 'john@example.com' };
   * const response = await AxiosClient.post<User>('/users', newUser);
   * if (response.success) {
   *   const createdUser = response.payload; // Type: User
   *   console.log(`Created user with ID: ${createdUser.id}`);
   * }
   *
   * @example
   * // POST with file upload
   * const formData = new FormData();
   * formData.append('file', fileObject);
   * formData.append('description', 'User profile picture');
   *
   * const response = await AxiosClient.post<UploadResult>('/uploads', formData, {
   *   headers: { 'Content-Type': 'multipart/form-data' }
   * });
   */
  public static async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<IStandardResponseBody<T>> {
    return this.request<T>("post", url, data, config);
  }

  /**
   * Makes a PUT request with standardized response format
   *
   * @param url - The URL to send the request to
   * @param data - The data to send in the request body
   * @param config - Optional Axios request configuration
   * @returns Promise resolving to a standardized response with payload of type T
   *
   * @example
   * // Update a user
   * const userUpdates = { name: 'John Smith', status: 'active' };
   * const response = await AxiosClient.put<User>('/users/123', userUpdates);
   * if (response.success) {
   *   const updatedUser = response.payload;
   *   console.log(`Updated user: ${updatedUser.name}`);
   * }
   */
  public static async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<IStandardResponseBody<T>> {
    return this.request<T>("put", url, data, config);
  }

  /**
   * Makes a DELETE request with standardized response format
   *
   * @param url - The URL to send the request to
   * @param config - Optional Axios request configuration
   * @returns Promise resolving to a standardized response with payload of type T
   *
   * @example
   * // Delete a user
   * const response = await AxiosClient.delete<{ deleted: boolean }>('/users/123');
   * if (response.success && response.payload.deleted) {
   *   console.log('User successfully deleted');
   * }
   *
   * @example
   * // Delete with additional options
   * const response = await AxiosClient.delete('/users/123', {
   *   params: { permanent: true },
   *   headers: { 'Authorization': 'Bearer admin-token' }
   * });
   */
  public static async delete<T>(url: string, config?: AxiosRequestConfig): Promise<IStandardResponseBody<T>> {
    return this.request<T>("delete", url, undefined, config);
  }

  /**
   * Makes a PATCH request with standardized response format
   *
   * @param url - The URL to send the request to
   * @param data - The partial data to send in the request body
   * @param config - Optional Axios request configuration
   * @returns Promise resolving to a standardized response with payload of type T
   *
   * @example
   * // Partially update a resource
   * const updates = { status: 'inactive' };
   * const response = await AxiosClient.patch<User>('/users/123', updates);
   * if (response.success) {
   *   const updatedUser = response.payload;
   *   console.log(`User status updated to: ${updatedUser.status}`);
   * }
   */
  public static async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<IStandardResponseBody<T>> {
    return this.request<T>("patch", url, data, config);
  }
}
