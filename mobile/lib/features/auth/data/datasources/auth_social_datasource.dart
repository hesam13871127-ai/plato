import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Wraps the native Google/Apple SDKs and returns the ID tokens the backend
/// needs to verify. Kept separate so it can be mocked in tests.
class AuthSocialDataSource {
  AuthSocialDataSource({GoogleSignIn? googleSignIn})
      : _googleSignIn = googleSignIn ?? GoogleSignIn();

  final GoogleSignIn _googleSignIn;

  Future<String> googleIdToken() async {
    final account = await _googleSignIn.signIn();
    if (account == null) {
      throw const SocialSignInCancelledException();
    }
    final authentication = await account.authentication;
    final idToken = authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw Exception('Google sign-in did not return an ID token.');
    }
    return idToken;
  }

  Future<AppleIdToken> appleIdToken() async {
    final credential = await SignInWithApple.getAppleIDCredential(
      scopes: [
        AppleIDAuthorizationScopes.email,
        AppleIDAuthorizationScopes.fullName,
      ],
    );
    final idToken = credential.identityToken;
    if (idToken == null || idToken.isEmpty) {
      throw Exception('Apple sign-in did not return an ID token.');
    }
    final givenName = credential.givenName;
    final familyName = credential.familyName;
    final displayName = [givenName, familyName].whereType<String>().where((s) => s.isNotEmpty).join(' ');
    return AppleIdToken(idToken: idToken, displayName: displayName.isEmpty ? null : displayName);
  }
}

class AppleIdToken {
  const AppleIdToken({required this.idToken, this.displayName});
  final String idToken;
  final String? displayName;
}

class SocialSignInCancelledException implements Exception {
  const SocialSignInCancelledException([this.message = 'Sign-in was cancelled.']);
  final String message;
}
