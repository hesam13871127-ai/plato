/// Backend REST endpoints (paths are appended to `{API_BASE_URL}/api`).
class ApiEndpoints {
  ApiEndpoints._();

  // Health
  static const String health = '/health';

  // Auth
  static const String phoneRequestOtp = '/auth/phone/request-otp';
  static const String phoneVerify = '/auth/phone/verify';
  static const String googleLogin = '/auth/google';
  static const String appleLogin = '/auth/apple';
  static const String emailRegister = '/auth/email/register';
  static const String emailLogin = '/auth/email/login';
  static const String refresh = '/auth/refresh';
  static const String logout = '/auth/logout';

  // Users
  static const String me = '/users/me';
}
