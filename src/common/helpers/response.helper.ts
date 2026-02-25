export class ResponseHelper {
  static success<T>(data: T, message?: string) {
    return {
      success: true,
      message: message ?? 'Opération réussie',
      data,
      timeStamp: new Date().toISOString(),
    };
  }

  static error(code: string, message: string, path: string) {
    return {
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
        path,
      },
    };
  }
}
