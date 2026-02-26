export interface IAppError {
  statusCode: number;
  code: string;
  message: string;
  details?: any;
}