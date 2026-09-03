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
  static String byUsername(String username) => '/users/by-username/$username';

  // Shop
  static const String shopItems = '/shop/items';
  static const String shopPurchase = '/shop/purchase';
  static const String shopGift = '/shop/gift';
  static const String shopInventory = '/shop/inventory';
  static const String shopEquip = '/shop/inventory/equip';
  static String shopUnequip(String inventoryId) => '/shop/inventory/$inventoryId/unequip';
  static const String shopUsernameChange = '/shop/username/change';
  static const String shopTransactions = '/shop/transactions';

  // Quests + daily rewards
  static const String questsDaily = '/quests/daily';
  static const String questsDailyClaim = '/quests/daily/claim';
  static String questClaim(String userQuestId) => '/quests/$userQuestId/claim';
}
