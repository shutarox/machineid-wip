export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;

    // スタックトレースを正しく設定（V8エンジン用）
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// このエラーのときは、メッセージがフロントエンドに送信・表示される

export class ClientError extends AppError {
  constructor(message: string, statusCode: number = 400) {
    super(message, statusCode);
  }
}

export class ValidationError extends ClientError {
  constructor(message: string, statusCode: number = 400) {
    super(message, statusCode);
  }
}

export class ServerError extends AppError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode);
  }
}
