import 'package:dio/dio.dart';

import 'failures.dart';

/// Translates a thrown exception into a user-facing [Failure].
Failure mapErrorToFailure(Object error) {
  if (error is Failure) return error;

  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.transformTimeout:
        return const NetworkFailure('The request timed out. Check your connection.');
      case DioExceptionType.connectionError:
        return const NetworkFailure();
      case DioExceptionType.badResponse:
        return _mapResponseError(error.response);
      case DioExceptionType.cancel:
        return const UnknownFailure('Request was cancelled.');
      case DioExceptionType.badCertificate:
      case DioExceptionType.unknown:
        return const UnknownFailure();
    }
  }

  return const UnknownFailure();
}

Failure _mapResponseError(Response<dynamic>? response) {
  final status = response?.statusCode ?? 500;
  final message = _extractMessage(response?.data);

  switch (status) {
    case 400:
      return ValidationFailure(message);
    case 401:
      return const AuthFailure('Your session expired. Please sign in again.');
    case 403:
      return const AuthFailure('You do not have permission to do that.');
    case 404:
      return NotFoundFailure(message);
    case 409:
      return ConflictFailure(message);
    default:
      return ServerFailure(message);
  }
}

/// Backend error envelope: `{ message: String | List<String> }`.
String _extractMessage(dynamic data) {
  if (data is Map<String, dynamic>) {
    final message = data['message'];
    if (message is String && message.isNotEmpty) return message;
    if (message is List && message.isNotEmpty) return message.first.toString();
  }
  return 'Something went wrong. Please try again.';
}
