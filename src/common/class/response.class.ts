export enum ResponseStatus {
  SUCCESS = "success",
  ERROR = "error",
  PENDING = "pending",
}

export interface ResponseData {
  content: string;
  timestamp?: Date;
  status?: ResponseStatus;
  metadata?: Record<string, unknown>;
}

export class Response {
  private content: string;
  private timestamp: Date;
  private status: ResponseStatus;
  private metadata: Record<string, unknown>;

  constructor(data: ResponseData) {
    this.content = data.content;
    this.timestamp = data.timestamp || new Date();
    this.status = data.status || ResponseStatus.SUCCESS;
    this.metadata = data.metadata || {};
  }

  getContent(): string {
    return this.content;
  }

  getTimestamp(): Date {
    return this.timestamp;
  }

  getStatus(): ResponseStatus {
    return this.status;
  }

  getMetadata(): Record<string, unknown> {
    return this.metadata;
  }

  setContent(content: string): void {
    this.content = content;
  }

  setStatus(status: ResponseStatus): void {
    this.status = status;
  }

  addMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }

  toJSON(): Record<string, unknown> {
    return {
      content: this.content,
      timestamp: this.timestamp,
      status: this.status,
      metadata: this.metadata,
    };
  }

  toString(): string {
    return JSON.stringify(this.toJSON());
  }

  static createSuccessResponse(content: string, metadata?: Record<string, unknown>): Response {
    return new Response({
      content,
      status: ResponseStatus.SUCCESS,
      metadata,
    });
  }

  static createErrorResponse(content: string, metadata?: Record<string, unknown>): Response {
    return new Response({
      content,
      status: ResponseStatus.ERROR,
      metadata,
    });
  }
}
