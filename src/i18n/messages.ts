import { AR_AUTO_TRANSLATIONS } from "@/i18n/arAuto";
import { AZ_AUTO_TRANSLATIONS } from "@/i18n/azAuto";
import { CA_AUTO_TRANSLATIONS } from "@/i18n/caAuto";
import { CS_AUTO_TRANSLATIONS } from "@/i18n/csAuto";
import { DE_AUTO_TRANSLATIONS } from "@/i18n/deAuto";
import { ES_AUTO_TRANSLATIONS } from "@/i18n/esAuto";
import { FA_AUTO_TRANSLATIONS } from "@/i18n/faAuto";
import { FI_AUTO_TRANSLATIONS } from "@/i18n/fiAuto";
import { FR_AUTO_TRANSLATIONS } from "@/i18n/frAuto";
import { HE_AUTO_TRANSLATIONS } from "@/i18n/heAuto";
import { HI_AUTO_TRANSLATIONS } from "@/i18n/hiAuto";
import { HU_AUTO_TRANSLATIONS } from "@/i18n/huAuto";
import { ID_AUTO_TRANSLATIONS } from "@/i18n/idAuto";
import { IT_AUTO_TRANSLATIONS } from "@/i18n/itAuto";
import { JA_AUTO_TRANSLATIONS } from "@/i18n/jaAuto";
import { KO_AUTO_TRANSLATIONS } from "@/i18n/koAuto";
import { MS_AUTO_TRANSLATIONS } from "@/i18n/msAuto";
import { NB_AUTO_TRANSLATIONS } from "@/i18n/nbAuto";
import { NL_AUTO_TRANSLATIONS } from "@/i18n/nlAuto";
import { PL_AUTO_TRANSLATIONS } from "@/i18n/plAuto";
import { PT_AUTO_TRANSLATIONS } from "@/i18n/ptAuto";
import { RU_AUTO_TRANSLATIONS } from "@/i18n/ruAuto";
import { SL_AUTO_TRANSLATIONS } from "@/i18n/slAuto";
import { SR_AUTO_TRANSLATIONS } from "@/i18n/srAuto";
import { TR_AUTO_TRANSLATIONS } from "@/i18n/trAuto";
import { UK_AUTO_TRANSLATIONS } from "@/i18n/ukAuto";
import { UR_AUTO_TRANSLATIONS } from "@/i18n/urAuto";
import { VI_AUTO_TRANSLATIONS } from "@/i18n/viAuto";
import { ZH_AUTO_TRANSLATIONS } from "@/i18n/zhAuto";
import { ZH_TW_AUTO_TRANSLATIONS } from "@/i18n/zhTwAuto";
import {
  buildHistoricalTranslationTable,
  EGYPTIAN_TRANSLATIONS,
  OLD_AKKADIAN_TRANSLATIONS,
} from "@/i18n/ancientTranslations";
import { GOVERNANCE_ENGLISH_FALLBACK_TRANSLATIONS } from "@/i18n/governanceTranslations";
import { QUIET_SAKURA_TRANSLATIONS } from "@/i18n/quietSakuraTranslations";

export const SUPPORTED_LOCALES = [
  "en-US",
  "ar-SA",
  "az-AZ",
  "ca-ES",
  "cs-CZ",
  "de-DE",
  "egy-Egyp",
  "es-ES",
  "fa-IR",
  "fi-FI",
  "fr-FR",
  "he-IL",
  "hi-IN",
  "hu-HU",
  "id-ID",
  "it-IT",
  "ja-JP",
  "akk-Xsux",
  "ko-KR",
  "ms-MY",
  "nb-NO",
  "nl-NL",
  "pl-PL",
  "pt-PT",
  "ru-RU",
  "sr-RS",
  "sl-SI",
  "tr-TR",
  "uk-UA",
  "ur-PK",
  "vi-VN",
  "zh-CN",
  "zh-TW",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocaleDirection = "ltr" | "rtl";

type Params = Record<string, string | number>;
type TranslationTable = Record<string, string>;

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  "en-US": "English",
  "ar-SA": "العربية",
  "az-AZ": "Azərbaycanca",
  "ca-ES": "Català",
  "cs-CZ": "Čeština",
  "de-DE": "Deutsch",
  "egy-Egyp": "𓌃𓂧𓅱 𓆎𓅓𓏏",
  "es-ES": "Español",
  "fa-IR": "فارسی",
  "fi-FI": "Suomi",
  "fr-FR": "Français",
  "he-IL": "עברית",
  "hi-IN": "हिन्दी",
  "hu-HU": "Magyar",
  "id-ID": "Bahasa Indonesia",
  "it-IT": "Italiano",
  "ja-JP": "日本語",
  "akk-Xsux": "𒅴 𒀝𒅗𒁺",
  "ko-KR": "한국어",
  "ms-MY": "Bahasa Melayu",
  "nb-NO": "Norsk bokmål",
  "nl-NL": "Nederlands",
  "pl-PL": "Polski",
  "pt-PT": "Português",
  "ru-RU": "Русский",
  "sr-RS": "Српски",
  "sl-SI": "Slovenščina",
  "tr-TR": "Türkçe",
  "uk-UA": "Українська",
  "ur-PK": "اردو",
  "vi-VN": "Tiếng Việt",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

export const LOCALE_DIRECTIONS: Record<SupportedLocale, LocaleDirection> = {
  "en-US": "ltr",
  "ar-SA": "rtl",
  "az-AZ": "ltr",
  "ca-ES": "ltr",
  "cs-CZ": "ltr",
  "de-DE": "ltr",
  "egy-Egyp": "ltr",
  "es-ES": "ltr",
  "fa-IR": "rtl",
  "fi-FI": "ltr",
  "fr-FR": "ltr",
  "he-IL": "rtl",
  "hi-IN": "ltr",
  "hu-HU": "ltr",
  "id-ID": "ltr",
  "it-IT": "ltr",
  "ja-JP": "ltr",
  "akk-Xsux": "ltr",
  "ko-KR": "ltr",
  "ms-MY": "ltr",
  "nb-NO": "ltr",
  "nl-NL": "ltr",
  "pl-PL": "ltr",
  "pt-PT": "ltr",
  "ru-RU": "ltr",
  "sr-RS": "ltr",
  "sl-SI": "ltr",
  "tr-TR": "ltr",
  "uk-UA": "ltr",
  "ur-PK": "rtl",
  "vi-VN": "ltr",
  "zh-CN": "ltr",
  "zh-TW": "ltr",
};

const JA_MANUAL_TRANSLATIONS: TranslationTable = {
  "Iroha Points": "Irohaポイント",
  "Torii control deck": "Toriiコントロールデッキ",
  "Modern Torii-connected wallet": "SORA Nexusウォレット",
  Torii: "Torii",
  Chain: "チェーン",
  "Asset not set": "アセット未設定",
  "Switch to light": "ライトモードへ切替",
  "Switch to dark": "ダークモードへ切替",
  Navigate: "ナビゲート",
  "Account ready": "アカウント準備完了",
  "Complete onboarding": "オンボーディングを完了",
  "Complete account setup first": "最初にアカウント設定を完了してください",
  "Active account": "アクティブアカウント",
  "Not created yet": "未作成",
  "No accounts saved yet": "保存済みアカウントはありません",
  "{count} saved": "{count}件保存済み",
  Connection: "接続",
  "TAIRA connection ready": "TAIRA接続準備完了",
  "TAIRA Torii ready": "TAIRA Torii準備完了",
  "Torii unavailable": "Torii未接続",
  "Account saved": "アカウント保存済み",
  "Onboarding required": "オンボーディングが必要",
  Language: "言語",
  "Account Setup": "アカウント設定",
  Session: "セッション",
  Wallet: "ウォレット",
  Staking: "ステーキング",
  Parliament: "議会",
  Subscriptions: "サブスクリプション",
  Send: "送信",
  Receive: "受信",
  Offline: "オフライン",
  Explore: "探索",
  "Generate keys, recovery phrase, Connect pairing": "鍵とリカバリを作成",
  "TAIRA connection, asset, and authority keys": "TAIRA接続と鍵",
  "Balances, assets, and latest transactions": "残高と履歴",
  "Nominate validators and stake XOR for NPOS": "XORをステーク",
  "Auto-deduct and manage recurring services": "定期支払い",
  "Transfer assets with camera or QR upload": "QRで送金",
  "Share QR codes or IH58 to request funds": "QRで受取",
  "Network metrics and asset explorer": "ネットワーク状況",
  "Session Setup": "セッション設定",
  "Provision your TAIRA testnet account": "TAIRAテストネットアカウントを準備",
  "TAIRA connection & keys": "TAIRA接続と鍵",
  "Wallet Overview": "ウォレット概要",
  "Balances & activity": "残高とアクティビティ",
  "NPOS Staking": "NPOSステーキング",
  "Nominate validators and stake XOR": "XORをステーク",
  "SORA Parliament": "SORA議会",
  "Subscription Hub": "サブスクリプションハブ",
  "Auto-deduct and manage services": "自動引き落としとサービス管理",
  "Send Points": "ポイント送信",
  "Transfer assets via Torii": "Torii経由でアセット送信",
  "Receive Points": "ポイント受信",
  "Share QR or IH58": "QRまたはIH58を共有",
  Explorer: "エクスプローラー",
  "Network & asset insights": "ネットワーク状況",
  "TAIRA locked": "TAIRA固定",
  "Open Taira Explorer": "TAIRA Explorerを開く",
  "Iroha logo": "Irohaロゴ",
  "IrohaConnect pairing QR": "IrohaConnectペアリングQR",
  "Explorer account QR": "エクスプローラーのアカウントQR",
  IH58: "IH58",
  "Bond {amount} XOR": "{amount} XORをボンド",
  "Bond XOR": "XORをボンド",
  "Bond amount": "ボンド額",
  "Bond amount (XOR)": "ボンド額 (XOR)",
  "Bond submitted: {hash}": "ボンド送信済み: {hash}",
  "TAIRA Testnet": "TAIRAテストネット",
  "Public TAIRA testnet profile.": "公開 TAIRA テストネットプロファイル。",
  "Store for iCloud Drive": "iCloud Drive に保存",
  "Store for Google Drive": "Google Drive に保存",
  "Register another": "別のアカウントを登録",
  "Start registration": "登録を開始",
  "Switch to this account": "このアカウントに切り替え",
  "Generate pair": "鍵ペアを生成",
  "Derive from private key": "秘密鍵から公開鍵を導出",
  "Save identity": "アカウント情報を保存",
  "Check health": "接続状態を確認",
  "Save authority": "権限情報を保存",
  "TAIRA testnet connection is fixed in this build.":
    "このビルドでは TAIRA テストネット接続に固定されています。",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "このビルドではオンボーディング用の TAIRA テストネット接続に固定されています。",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "{unit} {amount} まで",
  "Usage based": "従量課金",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const JA_TRANSLATIONS: TranslationTable = {
  ...JA_AUTO_TRANSLATIONS,
  ...JA_MANUAL_TRANSLATIONS,
};

const RU_MANUAL_TRANSLATIONS: TranslationTable = {
  "SORA Parliament": "Парламент SORA",
  "A minimum of {amount} XOR is required to register citizenship.":
    "Для регистрации гражданства требуется минимум {amount} XOR.",
  "Available XOR balance is below the required citizen bond amount.":
    "Доступный баланс XOR ниже требуемой суммы гражданского депозита.",
  "Citizenship Bond": "Гражданский депозит",
  "Citizenship bond submitted: {hash}": "Гражданский депозит отправлен: {hash}",
  "Bond {amount} XOR": "Заблокировать {amount} XOR",
  "Bond XOR": "Заблокировать XOR",
  "Bond amount": "Сумма блокировки",
  "Bond amount (XOR)": "Сумма блокировки (XOR)",
  "Bond submitted: {hash}": "Блокировка отправлена: {hash}",
  "Amount (XOR)": "Сумма (XOR)",
  "XOR Balance": "Баланс XOR",
  Bonded: "Застейкано",
  "bonded stake": "застейканный объем",
  "Bond / Unbond": "Стейк / Анстейк",
  "Pending Unbonds": "Ожидающие анстейки",
  "No bonded stake available to unbond.":
    "Нет застейканного объема для анстейка.",
  "Unbond amount": "Сумма анстейка",
  "Unbond amount (XOR)": "Сумма анстейка (XOR)",
  "Unbond Delay": "Задержка анстейка",
  "Schedule Unbond": "Запланировать анстейк",
  "Finalize Unbond": "Подтвердить анстейк",
  "Unbond scheduled ({requestId}) for {datetime}. Tx: {hash}":
    "Анстейк ({requestId}) запланирован на {datetime}. Tx: {hash}",
  "No {symbol} balance available to bond.":
    "Недостаточно баланса {symbol} для блокировки.",
  "Nominate validators and stake XOR": "Стейкайте XOR",
  "Nominate validators and stake XOR for NPOS": "Стейкайте XOR",
  "TAIRA Testnet": "Тестнет TAIRA",
  "Public TAIRA testnet profile.": "Публичный профиль тестнета TAIRA.",
  "Store for iCloud Drive": "Сохранить в iCloud Drive",
  "Store for Google Drive": "Сохранить в Google Drive",
  "Register another": "Зарегистрировать еще один аккаунт",
  "Start registration": "Начать регистрацию",
  "Generate pair": "Сгенерировать ключи",
  "Save identity": "Сохранить профиль",
  "Check health": "Проверить соединение",
  "Save authority": "Сохранить права доступа",
  "TAIRA testnet connection is fixed in this build.":
    "В этой сборке подключение к тестнету TAIRA фиксировано.",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "В этой сборке для онбординга используется фиксированное подключение к тестнету TAIRA.",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "До {unit} {amount}",
  "Usage based": "По использованию",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const UK_MANUAL_TRANSLATIONS: TranslationTable = {
  "SORA Parliament": "Парламент SORA",
  "A minimum of {amount} XOR is required to register citizenship.":
    "Для реєстрації громадянства потрібен мінімум {amount} XOR.",
  "Available XOR balance is below the required citizen bond amount.":
    "Доступний баланс XOR нижчий за потрібну суму громадянського депозиту.",
  "Citizenship Bond": "Громадянський депозит",
  "Citizenship bond submitted: {hash}":
    "Громадянський депозит надіслано: {hash}",
  "Bond {amount} XOR": "Заблокувати {amount} XOR",
  "Bond XOR": "Заблокувати XOR",
  "Bond amount": "Сума блокування",
  "Bond amount (XOR)": "Сума блокування (XOR)",
  "Bond submitted: {hash}": "Блокування надіслано: {hash}",
  "Amount (XOR)": "Сума (XOR)",
  "XOR Balance": "Баланс XOR",
  Bonded: "Застейкано",
  "bonded stake": "застейканий обсяг",
  "Bond / Unbond": "Стейк / Анстейк",
  "Pending Unbonds": "Очікувані анстейки",
  "No bonded stake available to unbond.":
    "Немає застейканого обсягу для анстейку.",
  "Unbond amount": "Сума анстейку",
  "Unbond amount (XOR)": "Сума анстейку (XOR)",
  "Unbond Delay": "Затримка анстейку",
  "Schedule Unbond": "Запланувати анстейк",
  "Finalize Unbond": "Підтвердити анстейк",
  "Unbond scheduled ({requestId}) for {datetime}. Tx: {hash}":
    "Анстейк ({requestId}) заплановано на {datetime}. Tx: {hash}",
  "No {symbol} balance available to bond.":
    "Недостатньо балансу {symbol} для блокування.",
  "Nominate validators and stake XOR": "Стейкайте XOR",
  "Nominate validators and stake XOR for NPOS": "Стейкайте XOR",
  "TAIRA Testnet": "Тестнет TAIRA",
  "Public TAIRA testnet profile.": "Публічний профіль тестнету TAIRA.",
  "Store for iCloud Drive": "Зберегти в iCloud Drive",
  "Store for Google Drive": "Зберегти в Google Drive",
  "Register another": "Зареєструвати ще один акаунт",
  "Start registration": "Почати реєстрацію",
  "Generate pair": "Згенерувати ключі",
  "Save identity": "Зберегти профіль",
  "Check health": "Перевірити з’єднання",
  "Save authority": "Зберегти права доступу",
  "TAIRA testnet connection is fixed in this build.":
    "У цій збірці підключення до тестнету TAIRA зафіксоване.",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "У цій збірці для онбордингу використовується фіксоване підключення до тестнету TAIRA.",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "До {unit} {amount}",
  "Usage based": "За використанням",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const ZH_MANUAL_TRANSLATIONS: TranslationTable = {
  "SORA Parliament": "SORA 议会",
  "A minimum of {amount} XOR is required to register citizenship.":
    "注册公民身份至少需要 {amount} XOR。",
  "Available XOR balance is below the required citizen bond amount.":
    "可用 XOR 余额低于所需公民保证金金额。",
  "Citizenship Bond": "公民保证金",
  "Citizenship bond submitted: {hash}": "公民保证金已提交：{hash}",
  "Bond {amount} XOR": "质押 {amount} XOR",
  "Bond XOR": "质押 XOR",
  "Bond amount": "质押金额",
  "Bond amount (XOR)": "质押金额（XOR）",
  "Bond submitted: {hash}": "质押已提交：{hash}",
  "Amount (XOR)": "金额（XOR）",
  "XOR Balance": "XOR 余额",
  Bonded: "已质押",
  "bonded stake": "已质押份额",
  "Bond / Unbond": "质押 / 解质押",
  "Pending Unbonds": "待解质押",
  "No bonded stake available to unbond.": "没有可解质押的已质押份额。",
  "Unbond amount": "解质押金额",
  "Unbond amount (XOR)": "解质押金额（XOR）",
  "Unbond Delay": "解质押延迟",
  "Schedule Unbond": "发起解质押",
  "Finalize Unbond": "确认解质押",
  "Unbond scheduled ({requestId}) for {datetime}. Tx: {hash}":
    "解质押（{requestId}）已安排在 {datetime}。Tx: {hash}",
  "No {symbol} balance available to bond.": "没有可用于质押的 {symbol} 余额。",
  "Nominate validators and stake XOR": "质押 XOR",
  "Nominate validators and stake XOR for NPOS": "质押 XOR",
  "TAIRA connection ready": "TAIRA 连接就绪",
  "TAIRA locked": "TAIRA 已锁定",
  "TAIRA Testnet": "TAIRA 测试网",
  "TAIRA Torii ready": "TAIRA Torii 已就绪",
  "Open Taira Explorer": "打开 TAIRA Explorer",
  "Public TAIRA testnet profile.": "公开 TAIRA 测试网配置。",
  "Store for iCloud Drive": "保存到 iCloud Drive",
  "Store for Google Drive": "保存到 Google Drive",
  "Register another": "再注册一个账户",
  "Generate pair": "生成密钥对",
  "Save identity": "保存账户信息",
  "Check health": "检查连接状态",
  "Save authority": "保存授权信息",
  "TAIRA testnet connection is fixed in this build.":
    "此版本中 TAIRA 测试网连接已固定。",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "此版本中用于注册的 TAIRA 测试网连接已固定。",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "最多 {unit} {amount}",
  "Usage based": "按使用量计费",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const ZH_TW_MANUAL_TRANSLATIONS: TranslationTable = {
  "TAIRA connection ready": "TAIRA 連線就緒",
  "TAIRA locked": "TAIRA 已鎖定",
  "TAIRA Testnet": "TAIRA 測試網",
  "TAIRA Torii ready": "TAIRA Torii 已就緒",
  "Open Taira Explorer": "開啟 TAIRA Explorer",
};

const KO_MANUAL_TRANSLATIONS: TranslationTable = {
  "SORA Parliament": "SORA 의회",
  "A minimum of {amount} XOR is required to register citizenship.":
    "시민권 등록에는 최소 {amount} XOR이 필요합니다.",
  "Available XOR balance is below the required citizen bond amount.":
    "사용 가능한 XOR 잔액이 시민권 본딩 필요 수량보다 부족합니다.",
  "Citizenship Bond": "시민권 본딩",
  "Citizenship bond submitted: {hash}": "시민권 본딩 제출됨: {hash}",
  "Bond {amount} XOR": "{amount} XOR 본딩",
  "Bond XOR": "XOR 본딩",
  "Bond amount": "본딩 수량",
  "Bond amount (XOR)": "본딩 수량 (XOR)",
  "Bond submitted: {hash}": "본딩 제출됨: {hash}",
  "Amount (XOR)": "수량 (XOR)",
  "XOR Balance": "XOR 잔액",
  Bonded: "본딩됨",
  "bonded stake": "본딩된 스테이크",
  "Bond / Unbond": "본딩 / 언본딩",
  "Pending Unbonds": "대기 중인 언본딩",
  "No bonded stake available to unbond.": "언본딩할 본딩 스테이크가 없습니다.",
  "Unbond amount": "언본딩 수량",
  "Unbond amount (XOR)": "언본딩 수량 (XOR)",
  "Unbond Delay": "언본딩 지연",
  "Schedule Unbond": "언본딩 예약",
  "Finalize Unbond": "언본딩 확정",
  "Unbond scheduled ({requestId}) for {datetime}. Tx: {hash}":
    "언본딩({requestId})이 {datetime}에 예약되었습니다. Tx: {hash}",
  "No {symbol} balance available to bond.":
    "본딩에 사용할 {symbol} 잔액이 없습니다.",
  "Nominate validators and stake XOR": "XOR 스테이킹",
  "Nominate validators and stake XOR for NPOS": "XOR 스테이킹",
  "Store for iCloud Drive": "iCloud Drive에 저장",
  "Store for Google Drive": "Google Drive에 저장",
  "Register another": "다른 계정 등록",
  "Generate pair": "키 쌍 생성",
  "Save identity": "프로필 저장",
  "Check health": "연결 상태 확인",
  "Save authority": "권한 정보 저장",
  "TAIRA testnet connection is fixed in this build.":
    "이 빌드에서는 TAIRA 테스트넷 연결이 고정됩니다.",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "이 빌드에서는 온보딩용 TAIRA 테스트넷 연결이 고정됩니다.",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "최대 {unit} {amount}",
  "Usage based": "사용량 기반",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const AR_MANUAL_TRANSLATIONS: TranslationTable = {
  "Iroha Points": "نقاط إيروها",
  "Torii control deck": "لوحة تحكم Torii",
  "Modern Torii-connected wallet": "محفظة TAIRA",
  Language: "اللغة",
  Navigate: "التنقل",
  "Account Setup": "إعداد الحساب",
  Session: "الجلسة",
  Wallet: "المحفظة",
  Staking: "الإيداع",
  Parliament: "البرلمان",
  Subscriptions: "الاشتراكات",
  Send: "إرسال",
  Receive: "استلام",
  Offline: "دون اتصال",
  Explore: "الاستكشاف",
  "Account ready": "الحساب جاهز",
  "Complete onboarding": "أكمل الإعداد",
  "Account saved": "تم حفظ الحساب",
  "Onboarding required": "الإعداد مطلوب",
  "TAIRA Torii ready": "Torii TAIRA جاهز",
  "Torii unavailable": "Torii غير متاح",
  "Generate keys, recovery phrase, Connect pairing":
    "أنشئ المفاتيح والنسخة الاحتياطية",
  "TAIRA connection, asset, and authority keys": "اتصال TAIRA والمفاتيح",
  "Balances, assets, and latest transactions": "الأرصدة والنشاط",
  "Auto-deduct and manage recurring services": "الدفعات المتكررة",
  "Transfer assets with camera or QR upload": "إرسال عبر QR",
  "Share QR codes or IH58 to request funds": "استلام عبر QR",
  "Network metrics and asset explorer": "بيانات الشبكة",
  "Wallet Overview": "نظرة عامة على المحفظة",
  "Balances & activity": "الأرصدة والنشاط",
  "Subscription Hub": "مركز الاشتراكات",
  "Send Points": "إرسال النقاط",
  "Receive Points": "استلام النقاط",
  "Network & asset insights": "رؤى الشبكة والأصول",
  "SORA Parliament": "برلمان SORA",
  "A minimum of {amount} XOR is required to register citizenship.":
    "يتطلب تسجيل المواطنة حدًا أدنى قدره {amount} XOR.",
  "Available XOR balance is below the required citizen bond amount.":
    "رصيد XOR المتاح أقل من قيمة سند المواطنة المطلوبة.",
  "Citizenship Bond": "سند المواطنة",
  "Citizenship bond submitted: {hash}": "تم إرسال سند المواطنة: {hash}",
  "Bond {amount} XOR": "أودع {amount} XOR",
  "Bond XOR": "أودع XOR",
  "Bond amount": "قيمة الإيداع",
  "Bond amount (XOR)": "قيمة الإيداع (XOR)",
  "Bond submitted: {hash}": "تم إرسال الإيداع: {hash}",
  "Amount (XOR)": "الكمية (XOR)",
  "XOR Balance": "رصيد XOR",
  "Bond / Unbond": "إيداع / فك الإيداع",
  "Pending Unbonds": "عمليات فك الإيداع المعلقة",
  "No bonded stake available to unbond.":
    "لا توجد حصة مودعة متاحة لفك الإيداع.",
  "Unbond amount": "كمية فك الإيداع",
  "Unbond amount (XOR)": "كمية فك الإيداع (XOR)",
  "Unbond Delay": "مهلة فك الإيداع",
  "Schedule Unbond": "جدولة فك الإيداع",
  "Finalize Unbond": "تأكيد فك الإيداع",
  "No {symbol} balance available to bond.": "لا يتوفر رصيد {symbol} للإيداع.",
  "Nominate validators and stake XOR": "رشّح المدققين وقم بعمل Stake لـ XOR",
  "Nominate validators and stake XOR for NPOS":
    "رشّح المدققين وقم بعمل Stake لـ XOR لنظام NPOS",
  "TAIRA Testnet": "شبكة TAIRA التجريبية",
  "Public TAIRA testnet profile.": "ملف شبكة TAIRA التجريبية العامة.",
  "Store for iCloud Drive": "حفظ في iCloud Drive",
  "Store for Google Drive": "حفظ في Google Drive",
  "Generate pair": "إنشاء زوج مفاتيح",
  "Save identity": "حفظ الهوية",
  "Check health": "فحص الاتصال",
  "Save authority": "حفظ بيانات الصلاحية",
  "TAIRA testnet connection is fixed in this build.":
    "اتصال شبكة TAIRA التجريبية ثابت في هذا الإصدار.",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "اتصال شبكة TAIRA التجريبية للانضمام ثابت في هذا الإصدار.",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "حتى {unit} {amount}",
  "Usage based": "حسب الاستخدام",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const FA_MANUAL_TRANSLATIONS: TranslationTable = {
  "Iroha Points": "امتیازهای Iroha",
  "Torii control deck": "داشبورد کنترل Torii",
  "Modern Torii-connected wallet": "کیف پول TAIRA",
  Language: "زبان",
  Navigate: "پیمایش",
  "Account Setup": "راه‌اندازی حساب",
  Session: "نشست",
  Wallet: "کیف پول",
  Staking: "استیکینگ",
  Parliament: "پارلمان",
  Subscriptions: "اشتراک‌ها",
  Send: "ارسال",
  Receive: "دریافت",
  Offline: "آفلاین",
  Explore: "کاوش",
  "Account ready": "حساب آماده است",
  "Complete onboarding": "آنبوردینگ را کامل کنید",
  "Account saved": "حساب ذخیره شد",
  "Onboarding required": "آنبوردینگ لازم است",
  "TAIRA Torii ready": "Torii TAIRA آماده است",
  "Torii unavailable": "Torii در دسترس نیست",
  "Generate keys, recovery phrase, Connect pairing":
    "کلید و نسخه پشتیبان را بسازید",
  "TAIRA connection, asset, and authority keys": "اتصال TAIRA و کلیدها",
  "Balances, assets, and latest transactions": "موجودی و فعالیت",
  "Auto-deduct and manage recurring services": "پرداخت های دوره ای",
  "Transfer assets with camera or QR upload": "ارسال با QR",
  "Share QR codes or IH58 to request funds": "دریافت با QR",
  "Network metrics and asset explorer": "داده های شبکه",
  "Wallet Overview": "نمای کلی کیف پول",
  "Balances & activity": "موجودی و فعالیت",
  "Subscription Hub": "مرکز اشتراک",
  "Send Points": "ارسال امتیاز",
  "Receive Points": "دریافت امتیاز",
  "Network & asset insights": "بینش شبکه و دارایی",
  "SORA Parliament": "پارلمان SORA",
  "A minimum of {amount} XOR is required to register citizenship.":
    "برای ثبت شهروندی حداقل {amount} XOR لازم است.",
  "Available XOR balance is below the required citizen bond amount.":
    "موجودی XOR کمتر از مقدار باند شهروندی موردنیاز است.",
  "Citizenship Bond": "باند شهروندی",
  "Citizenship bond submitted: {hash}": "باند شهروندی ارسال شد: {hash}",
  "Bond {amount} XOR": "باند {amount} XOR",
  "Bond XOR": "باند XOR",
  "Bond amount": "مقدار باند",
  "Bond amount (XOR)": "مقدار باند (XOR)",
  "Bond submitted: {hash}": "باند ارسال شد: {hash}",
  "Amount (XOR)": "مقدار (XOR)",
  "XOR Balance": "موجودی XOR",
  "Bond / Unbond": "باند / آن‌باند",
  "Pending Unbonds": "آن‌باندهای در انتظار",
  "No bonded stake available to unbond.":
    "هیچ استیک باندشده‌ای برای آن‌باند وجود ندارد.",
  "Unbond amount": "مقدار آن‌باند",
  "Unbond amount (XOR)": "مقدار آن‌باند (XOR)",
  "Unbond Delay": "تاخیر آن‌باند",
  "Schedule Unbond": "زمان‌بندی آن‌باند",
  "Finalize Unbond": "نهایی‌سازی آن‌باند",
  "No {symbol} balance available to bond.":
    "موجودی {symbol} برای باند در دسترس نیست.",
  "Nominate validators and stake XOR":
    "اعتبارسنج‌ها را نامزد کرده و XOR استیک کنید",
  "Nominate validators and stake XOR for NPOS":
    "اعتبارسنج‌ها را نامزد کرده و XOR را برای NPOS استیک کنید",
  "TAIRA Testnet": "تست‌نت TAIRA",
  "Public TAIRA testnet profile.": "پروفایل عمومی تست‌نت TAIRA.",
  "Store for iCloud Drive": "ذخیره در iCloud Drive",
  "Store for Google Drive": "ذخیره در Google Drive",
  "Generate pair": "ایجاد جفت‌کلید",
  "Save identity": "ذخیره هویت",
  "Check health": "بررسی اتصال",
  "Save authority": "ذخیره مجوز",
  "TAIRA testnet connection is fixed in this build.":
    "اتصال تست‌نت TAIRA در این نسخه ثابت است.",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "اتصال تست‌نت TAIRA برای آنبوردینگ در این نسخه ثابت است.",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "تا {unit} {amount}",
  "Usage based": "مبتنی بر مصرف",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const HE_MANUAL_TRANSLATIONS: TranslationTable = {
  "Iroha Points": "נקודות Iroha",
  "Torii control deck": "לוח בקרה של Torii",
  "Modern Torii-connected wallet": "ארנק TAIRA",
  Language: "שפה",
  Navigate: "ניווט",
  "Account Setup": "הגדרת חשבון",
  Session: "סשן",
  Wallet: "ארנק",
  Staking: "סטייקינג",
  Parliament: "פרלמנט",
  Subscriptions: "מנויים",
  Send: "שליחה",
  Receive: "קבלה",
  Offline: "אופליין",
  Explore: "חקירה",
  "Account ready": "החשבון מוכן",
  "Complete onboarding": "השלימו את תהליך ההצטרפות",
  "Account saved": "החשבון נשמר",
  "Onboarding required": "נדרש תהליך הצטרפות",
  "TAIRA Torii ready": "Torii של TAIRA מוכן",
  "Torii unavailable": "Torii לא זמין",
  "Generate keys, recovery phrase, Connect pairing": "צרו מפתחות וגיבוי",
  "TAIRA connection, asset, and authority keys": "חיבור TAIRA ומפתחות",
  "Balances, assets, and latest transactions": "יתרות ופעילות",
  "Auto-deduct and manage recurring services": "תשלומים חוזרים",
  "Transfer assets with camera or QR upload": "שליחה עם QR",
  "Share QR codes or IH58 to request funds": "קבלה עם QR",
  "Network metrics and asset explorer": "נתוני רשת",
  "Wallet Overview": "סקירת ארנק",
  "Balances & activity": "יתרות ופעילות",
  "Subscription Hub": "מרכז מנויים",
  "Send Points": "שליחת נקודות",
  "Receive Points": "קבלת נקודות",
  "Network & asset insights": "תובנות רשת ונכסים",
  "SORA Parliament": "פרלמנט SORA",
  "A minimum of {amount} XOR is required to register citizenship.":
    "נדרש מינימום של {amount} XOR לרישום אזרחות.",
  "Available XOR balance is below the required citizen bond amount.":
    "יתרת XOR הזמינה נמוכה מסכום בונד האזרחות הנדרש.",
  "Citizenship Bond": "בונד אזרחות",
  "Citizenship bond submitted: {hash}": "בונד האזרחות נשלח: {hash}",
  "Bond {amount} XOR": "בצעו בונד של {amount} XOR",
  "Bond XOR": "בצעו בונד XOR",
  "Bond amount": "סכום בונד",
  "Bond amount (XOR)": "סכום בונד (XOR)",
  "Bond submitted: {hash}": "הבונד נשלח: {hash}",
  "Amount (XOR)": "כמות (XOR)",
  "XOR Balance": "יתרת XOR",
  "Bond / Unbond": "בונד / שחרור בונד",
  "Pending Unbonds": "שחרורי בונד בהמתנה",
  "No bonded stake available to unbond.": "אין סטייק בבונד שניתן לשחרר.",
  "Unbond amount": "סכום שחרור בונד",
  "Unbond amount (XOR)": "סכום שחרור בונד (XOR)",
  "Unbond Delay": "השהיית שחרור בונד",
  "Schedule Unbond": "תזמון שחרור בונד",
  "Finalize Unbond": "השלמת שחרור בונד",
  "No {symbol} balance available to bond.": "אין יתרת {symbol} זמינה לבונד.",
  "Nominate validators and stake XOR": "מנו מאמתים ובצעו סטייק ל-XOR",
  "Nominate validators and stake XOR for NPOS":
    "מנו מאמתים ובצעו סטייק ל-XOR עבור NPOS",
  "TAIRA Testnet": "רשת בדיקות TAIRA",
  "Public TAIRA testnet profile.": "פרופיל ציבורי של רשת הבדיקות TAIRA.",
  "Store for iCloud Drive": "שמירה ב-iCloud Drive",
  "Store for Google Drive": "שמירה ב-Google Drive",
  "Generate pair": "יצירת זוג מפתחות",
  "Save identity": "שמירת זהות",
  "Check health": "בדיקת חיבור",
  "Save authority": "שמירת הרשאה",
  "TAIRA testnet connection is fixed in this build.":
    "חיבור רשת הבדיקות TAIRA קבוע בגרסה זו.",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "חיבור רשת הבדיקות TAIRA לתהליך האונבורדינג קבוע בגרסה זו.",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "עד {unit} {amount}",
  "Usage based": "מבוסס שימוש",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const UR_MANUAL_TRANSLATIONS: TranslationTable = {
  "Iroha Points": "Iroha پوائنٹس",
  "Torii control deck": "Torii کنٹرول ڈیک",
  "Modern Torii-connected wallet": "TAIRA والیٹ",
  Language: "زبان",
  Navigate: "نیویگیٹ کریں",
  "Account Setup": "اکاؤنٹ سیٹ اپ",
  Session: "سیشن",
  Wallet: "والیٹ",
  Staking: "اسٹیکنگ",
  Parliament: "پارلیمنٹ",
  Subscriptions: "سبسکرپشنز",
  Send: "بھیجیں",
  Receive: "وصول کریں",
  Offline: "آف لائن",
  Explore: "ایکسپلور کریں",
  "Account ready": "اکاؤنٹ تیار ہے",
  "Complete onboarding": "آن بورڈنگ مکمل کریں",
  "Account saved": "اکاؤنٹ محفوظ ہے",
  "Onboarding required": "آن بورڈنگ درکار ہے",
  "TAIRA Torii ready": "TAIRA Torii تیار ہے",
  "Torii unavailable": "Torii دستیاب نہیں",
  "Generate keys, recovery phrase, Connect pairing": "کلیدیں اور بیک اپ بنائیں",
  "TAIRA connection, asset, and authority keys": "TAIRA کنکشن اور کلیدیں",
  "Balances, assets, and latest transactions": "بیلنس اور سرگرمی",
  "Auto-deduct and manage recurring services": "باربار ادائیگیاں",
  "Transfer assets with camera or QR upload": "QR سے بھیجیں",
  "Share QR codes or IH58 to request funds": "QR سے وصول کریں",
  "Network metrics and asset explorer": "نیٹ ورک ڈیٹا",
  "Wallet Overview": "والیٹ کا جائزہ",
  "Balances & activity": "بیلنس اور سرگرمی",
  "Subscription Hub": "سبسکرپشن ہب",
  "Send Points": "پوائنٹس بھیجیں",
  "Receive Points": "پوائنٹس وصول کریں",
  "Network & asset insights": "نیٹ ورک اور اثاثہ بصیرت",
  "SORA Parliament": "سورا پارلیمنٹ",
  "A minimum of {amount} XOR is required to register citizenship.":
    "شہریت رجسٹر کرنے کے لیے کم از کم {amount} XOR درکار ہے۔",
  "Available XOR balance is below the required citizen bond amount.":
    "دستیاب XOR بیلنس مطلوبہ شہریت بانڈ سے کم ہے۔",
  "Citizenship Bond": "شہریت بانڈ",
  "Citizenship bond submitted: {hash}": "شہریت بانڈ جمع ہو گیا: {hash}",
  "Bond {amount} XOR": "{amount} XOR بانڈ کریں",
  "Bond XOR": "XOR بانڈ کریں",
  "Bond amount": "بانڈ مقدار",
  "Bond amount (XOR)": "بانڈ مقدار (XOR)",
  "Bond submitted: {hash}": "بانڈ جمع ہو گیا: {hash}",
  "Amount (XOR)": "مقدار (XOR)",
  "XOR Balance": "XOR بیلنس",
  "Bond / Unbond": "بانڈ / ان بانڈ",
  "Pending Unbonds": "زیر التوا ان بانڈز",
  "No bonded stake available to unbond.":
    "ان بانڈ کے لیے کوئی بانڈ شدہ اسٹیک دستیاب نہیں۔",
  "Unbond amount": "ان بانڈ مقدار",
  "Unbond amount (XOR)": "ان بانڈ مقدار (XOR)",
  "Unbond Delay": "ان بانڈ تاخیر",
  "Schedule Unbond": "ان بانڈ شیڈول کریں",
  "Finalize Unbond": "ان بانڈ مکمل کریں",
  "No {symbol} balance available to bond.":
    "بانڈ کرنے کے لیے {symbol} بیلنس دستیاب نہیں۔",
  "Nominate validators and stake XOR": "ویلیڈیٹر نامزد کریں اور XOR اسٹیک کریں",
  "Nominate validators and stake XOR for NPOS":
    "NPOS کے لیے ویلیڈیٹر نامزد کریں اور XOR اسٹیک کریں",
  "TAIRA Testnet": "TAIRA ٹیسٹ نیٹ",
  "Public TAIRA testnet profile.": "عوامی TAIRA ٹیسٹ نیٹ پروفائل۔",
  "Store for iCloud Drive": "iCloud Drive میں محفوظ کریں",
  "Store for Google Drive": "Google Drive میں محفوظ کریں",
  "Generate pair": "جوڑا بنائیں",
  "Save identity": "شناخت محفوظ کریں",
  "Check health": "کنکشن چیک کریں",
  "Save authority": "اتھارٹی محفوظ کریں",
  "TAIRA testnet connection is fixed in this build.":
    "اس بلڈ میں TAIRA ٹیسٹ نیٹ کنکشن مقرر ہے۔",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "اس بلڈ میں آن بورڈنگ کے لیے TAIRA ٹیسٹ نیٹ کنکشن مقرر ہے۔",
  wonderland: "wonderland",
  "rose#wonderland": "rose#wonderland",
  "Up to {unit} {amount}": "{unit} {amount} تک",
  "Usage based": "استعمال کے مطابق",
  "{unit} --": "{unit} --",
  "{unit} {amount}": "{unit} {amount}",
};

const RU_TRANSLATIONS: TranslationTable = {
  ...RU_AUTO_TRANSLATIONS,
  ...RU_MANUAL_TRANSLATIONS,
};

const UK_TRANSLATIONS: TranslationTable = {
  ...UK_AUTO_TRANSLATIONS,
  ...UK_MANUAL_TRANSLATIONS,
};

const ZH_TRANSLATIONS: TranslationTable = {
  ...ZH_AUTO_TRANSLATIONS,
  ...ZH_MANUAL_TRANSLATIONS,
};

const KO_TRANSLATIONS: TranslationTable = {
  ...KO_AUTO_TRANSLATIONS,
  ...KO_MANUAL_TRANSLATIONS,
};

const AR_TRANSLATIONS: TranslationTable = {
  ...AR_AUTO_TRANSLATIONS,
  ...AR_MANUAL_TRANSLATIONS,
};
const AZ_TRANSLATIONS: TranslationTable = AZ_AUTO_TRANSLATIONS;
const CA_TRANSLATIONS: TranslationTable = CA_AUTO_TRANSLATIONS;
const CS_TRANSLATIONS: TranslationTable = CS_AUTO_TRANSLATIONS;
const DE_TRANSLATIONS: TranslationTable = DE_AUTO_TRANSLATIONS;
const ES_TRANSLATIONS: TranslationTable = ES_AUTO_TRANSLATIONS;
const FA_TRANSLATIONS: TranslationTable = {
  ...FA_AUTO_TRANSLATIONS,
  ...FA_MANUAL_TRANSLATIONS,
};
const FI_TRANSLATIONS: TranslationTable = FI_AUTO_TRANSLATIONS;
const FR_TRANSLATIONS: TranslationTable = FR_AUTO_TRANSLATIONS;
const HE_TRANSLATIONS: TranslationTable = {
  ...HE_AUTO_TRANSLATIONS,
  ...HE_MANUAL_TRANSLATIONS,
};
const HI_TRANSLATIONS: TranslationTable = HI_AUTO_TRANSLATIONS;
const HU_TRANSLATIONS: TranslationTable = HU_AUTO_TRANSLATIONS;
const ID_TRANSLATIONS: TranslationTable = ID_AUTO_TRANSLATIONS;
const IT_TRANSLATIONS: TranslationTable = IT_AUTO_TRANSLATIONS;
const MS_TRANSLATIONS: TranslationTable = MS_AUTO_TRANSLATIONS;
const NB_TRANSLATIONS: TranslationTable = NB_AUTO_TRANSLATIONS;
const NL_TRANSLATIONS: TranslationTable = NL_AUTO_TRANSLATIONS;
const PL_TRANSLATIONS: TranslationTable = PL_AUTO_TRANSLATIONS;
const PT_TRANSLATIONS: TranslationTable = PT_AUTO_TRANSLATIONS;
const SL_TRANSLATIONS: TranslationTable = SL_AUTO_TRANSLATIONS;
const SR_TRANSLATIONS: TranslationTable = SR_AUTO_TRANSLATIONS;
const TR_TRANSLATIONS: TranslationTable = TR_AUTO_TRANSLATIONS;
const UR_TRANSLATIONS: TranslationTable = {
  ...UR_AUTO_TRANSLATIONS,
  ...UR_MANUAL_TRANSLATIONS,
};
const VI_TRANSLATIONS: TranslationTable = VI_AUTO_TRANSLATIONS;
const ZH_TW_TRANSLATIONS: TranslationTable = {
  ...ZH_TW_AUTO_TRANSLATIONS,
  ...ZH_TW_MANUAL_TRANSLATIONS,
};
const SHARED_ENGLISH_FALLBACK_TRANSLATIONS: TranslationTable = {
  ...GOVERNANCE_ENGLISH_FALLBACK_TRANSLATIONS,
  "{amount} {asset} ({kind})": "{amount} {asset} ({kind})",
  "Fee quote unavailable": "Fee quote unavailable",
  "Network fee quote unavailable.": "Network fee quote unavailable.",
  Nexus: "Nexus",
  "Pipeline gas": "Pipeline gas",
  "Quoted maximum network fee: {components} (paid by {payer}).":
    "Quoted maximum network fee: {components} (paid by {payer}).",
  "Quoted maximum network fee: none.": "Quoted maximum network fee: none.",
  "Quoted maximum: {components}": "Quoted maximum: {components}",
  "Quoted maximum: none": "Quoted maximum: none",
  sponsor: "sponsor",
  wallet: "wallet",
  "Storage base fee": "Storage base fee",
  "Actual storage charge": "Actual storage charge",
  "Maximum compute reservation charge": "Maximum compute reservation charge",
  "Actual compute reservation charge": "Actual compute reservation charge",
  "Pending indexing": "Pending indexing",
  "Transaction finalized; subscription state is still indexing":
    "Transaction finalized; subscription state is still indexing",
  "{action} finalized in block {height}.":
    "{action} finalized in block {height}.",
  "Checking live state…": "Checking live state…",
  "Refresh and reconcile": "Refresh and reconcile",
  "Subscription creation": "Subscription creation",
  "Subscription finalized: {hash}": "Subscription finalized: {hash}",
  "Subscription action finalized: {hash}":
    "Subscription action finalized: {hash}",
  "Finalized transaction is still indexing: {hash}":
    "Finalized transaction is still indexing: {hash}",
  "Finalized subscription state reconciled: {hash}":
    "Finalized subscription state reconciled: {hash}",
  "Create a manual answer packet in Advanced signaling instead.":
    "Create a manual answer packet in Advanced signaling instead.",
  "Create a manual offer packet in Advanced signaling instead.":
    "Create a manual offer packet in Advanced signaling instead.",
  "Create an on-chain Kaigi meeting, share its meeting link, then wait for the participant answer.":
    "Create an on-chain Kaigi meeting, share its meeting link, then wait for the participant answer.",
  "Create manual offer packet": "Create manual offer packet",
  "Creating manual offer…": "Creating manual offer…",
  "Live wallets create and join Kaigi meetings through on-chain signaling metadata.":
    "Live wallets create and join Kaigi meetings through on-chain signaling metadata.",
  "Keep this host window open after sharing the invite.":
    "Keep this host window open after sharing the invite.",
  "Manual Kaigi signaling is available only for local-only wallets.":
    "Manual Kaigi signaling is available only for local-only wallets.",
  "Manual offer packet ready in Advanced signaling. No meeting link was created.":
    "Manual offer packet ready in Advanced signaling. No meeting link was created.",
  "Open or paste a Kaigi meeting link, then join the live meeting.":
    "Open or paste a Kaigi meeting link, then join the live meeting.",
  "Share the meeting link. It contains only the on-chain call ID and invite secret.":
    "Share the meeting link. It contains only the on-chain call ID and invite secret.",
  "This endpoint does not advertise the Kaigi meeting write operations.":
    "This endpoint does not advertise the Kaigi meeting write operations.",
  "This meeting has ended.": "This meeting has ended.",
  "This meeting is not active.": "This meeting is not active.",
  "This wallet is local only. On-chain meeting links require a live wallet; use Advanced signaling for manual raw packets.":
    "This wallet is local only. On-chain meeting links require a live wallet; use Advanced signaling for manual raw packets.",
  "Unable to create a manual Kaigi offer.":
    "Unable to create a manual Kaigi offer.",
  "Unable to resume the active Kaigi meeting.":
    "Unable to resume the active Kaigi meeting.",
  "Clipboard access failed. Paste the meeting invite manually.":
    "Clipboard access failed. Paste the meeting invite manually.",
  "Approve request": "Approve request",
  "Approve signing request?": "Approve signing request?",
  "IrohaConnect request": "IrohaConnect request",
  "Payload bytes": "Payload bytes",
  "Raw message signature": "Raw message signature",
  "Relay token": "Relay token",
  "Request type": "Request type",
  "Review the exact request before allowing the connected app to use this wallet.":
    "Review the exact request before allowing the connected app to use this wallet.",
  "Scan a wallet-role QR from an app to connect it to this wallet. Every signing request still requires your approval.":
    "Scan a wallet-role QR from an app to connect it to this wallet. Every signing request still requires your approval.",
  "Transaction signature": "Transaction signature",
  "This endpoint does not advertise the required staking write operations.":
    "This endpoint does not advertise the required staking write operations.",
  "Account registration finalized in block {block}: {hash}":
    "Account registration finalized in block {block}: {hash}",
  "Quick actions": "Quick actions",
  Daily: "Daily",
  Grow: "Grow",
  Services: "Services",
  "Skip to content": "Skip to content",
  "Open wallet": "Open wallet",
  "Start setup": "Start setup",
  "Network details": "Network details",
  Network: "Network",
  "Managed by network profile": "Managed by network profile",
  "Settings-managed network profile.": "Settings-managed network profile.",
  Asset: "Asset",
  "Used for balances and payments": "Used for balances and payments",
  "Network prefix": "Network prefix",
  "Advanced routing detail": "Advanced routing detail",
  "Network ready": "Network ready",
  "Network unavailable": "Network unavailable",
  "Wallet saved": "Wallet saved",
  "No wallet yet": "No wallet yet",
  "Create or restore a wallet": "Create or restore a wallet",
  "Switch wallets or create a new one.": "Switch wallets or create a new one.",
  "Signing algorithm": "Signing algorithm",
  "Authority signing algorithm": "Authority signing algorithm",
  "Select a signing algorithm supported by this endpoint.":
    "Select a signing algorithm supported by this endpoint.",
  "This endpoint does not advertise any signing algorithms supported by this app.":
    "This endpoint does not advertise any signing algorithms supported by this app.",
  "Balance, funding, and activity": "Balance, funding, and activity",
  "Network health and activity": "Network health and activity",
  "Send to a canonical account": "Send to a canonical account",
  "Show a payment QR": "Show a payment QR",
  "Stake XOR with a validator": "Stake XOR with a validator",
  "Nominated proof of stake": "Nominated proof of stake",
  "Nominate validators, manage unbonding, claim rewards, or register this wallet as a public-lane validator.":
    "Nominate validators, manage unbonding, claim rewards, or register this wallet as a public-lane validator.",
  "Available to stake": "Available to stake",
  "Bonded across lane": "Bonded across lane",
  "Pending rewards / fees": "Pending rewards / fees",
  "APY estimate": "APY estimate",
  "Lane context": "Lane context",
  "Reward epoch duration (hours)": "Reward epoch duration (hours)",
  "{label} · {lanes} lane(s) · {validators} validator(s)":
    "{label} · {lanes} lane(s) · {validators} validator(s)",
  "Active validators": "Active validators",
  "Validator nominations": "Validator nominations",
  "Select a validator, then bond XOR to nominate it.":
    "Select a validator, then bond XOR to nominate it.",
  Status: "Status",
  "Total stake": "Total stake",
  "Lane share": "Lane share",
  "Self stake": "Self stake",
  Commission: "Commission",
  Nominators: "Nominators",
  "Last reward": "Last reward",
  Action: "Action",
  "Peer id unavailable": "Peer id unavailable",
  Selected: "Selected",
  Select: "Select",
  "No validators found for this lane.": "No validators found for this lane.",
  "Nominate and manage stake": "Nominate and manage stake",
  "Selected validator": "Selected validator",
  None: "None",
  "Your nomination": "Your nomination",
  "Bonded with selected validator": "Bonded with selected validator",
  "Observed reward epochs": "Observed reward epochs",
  "Operate a validator": "Operate a validator",
  "Register this wallet as validator authority and bond self stake before joining consensus.":
    "Register this wallet as validator authority and bond self stake before joining consensus.",
  "Not registered": "Not registered",
  "Validator account": "Validator account",
  "Peer ID": "Peer ID",
  "Delegated stake": "Delegated stake",
  "Fees / rewards pending": "Fees / rewards pending",
  "Consensus peer ID": "Consensus peer ID",
  "Validator endpoint": "Validator endpoint",
  "Commission (bps)": "Commission (bps)",
  "Self stake (XOR)": "Self stake (XOR)",
  "Validator registration payload": "Validator registration payload",
  "Select my validator": "Select my validator",
  "Join consensus": "Join consensus",
  "Rewards and APY": "Rewards and APY",
  "APY is estimated from pending rewards, bonded stake, and the configured reward epoch duration.":
    "APY is estimated from pending rewards, bonded stake, and the configured reward epoch duration.",
  "Claimable amount": "Claimable amount",
  "Last claimed": "Last claimed",
  "{value}%": "{value}%",
  "Commission must be a whole number from 0 to 10000.":
    "Commission must be a whole number from 0 to 10000.",
  "Validator registration submitted: {hash}":
    "Validator registration submitted: {hash}",
  "Bond finalized in block {block}: {hash}":
    "Bond finalized in block {block}: {hash}",
  "Validator registration finalized in block {block}: {hash}":
    "Validator registration finalized in block {block}: {hash}",
  "Unbond schedule finalized in block {block} ({requestId}) for {datetime}: {hash}":
    "Unbond schedule finalized in block {block} ({requestId}) for {datetime}: {hash}",
  "Unbond finalized in block {block}: {hash}":
    "Unbond finalized in block {block}: {hash}",
  "Reward claim finalized in block {block}: {hash}":
    "Reward claim finalized in block {block}: {hash}",
  "0.0001": "0.0001",
  Governance: "Governance",
  "Explorer QR and network status": "Explorer QR and network status",
  "Manage recurring payments": "Manage recurring payments",
  "Live subscription NFTs and plan metadata from Torii.":
    "Live subscription NFTs and plan metadata from Torii.",
  "This account has no subscriptions on the active network.":
    "This account has no subscriptions on the active network.",
  "Loaded from Torii at {time}": "Loaded from Torii at {time}",
  "Device payments and invoices": "Device payments and invoices",
  "Wallet-based meeting links": "Wallet-based meeting links",
  "Private network connection": "Private network connection",
  "Network and developer settings": "Network and developer settings",
  IrohaConnect: "IrohaConnect",
  Approval: "Approval",
  Ready: "Ready",
  "Approving...": "Approving...",
  "Approving…": "Approving…",
  "IrohaConnect connection": "IrohaConnect connection",
  "Approve connection?": "Approve connection?",
  "Approve connection": "Approve connection",
  "Review the requesting app details before allowing it to send wallet requests.":
    "Review the requesting app details before allowing it to send wallet requests.",
  "Review connection details before approving.":
    "Review connection details before approving.",
  "IrohaConnect connection rejected.": "IrohaConnect connection rejected.",
  Reject: "Reject",
  Rejected: "Rejected",
  "No active wallet": "No active wallet",
  "Wallet token": "Wallet token",
  Present: "Present",
  Missing: "Missing",
  "Not provided": "Not provided",
  "This request will not be signed or answered unless you approve it here.":
    "This request will not be signed or answered unless you approve it here.",
  "IrohaConnect transaction": "IrohaConnect transaction",
  "Approve private proof?": "Approve private proof?",
  "Approve proof": "Approve proof",
  "Waiting for wallet request...": "Waiting for wallet request...",
  "Waiting for your approval...": "Waiting for your approval...",
  "Approve transaction signature?": "Approve transaction signature?",
  "Approve and sign": "Approve and sign",
  "Request ID": "Request ID",
  "Requested account": "Requested account",
  "Signing payload bytes": "Signing payload bytes",
  "Signing payload preview": "Signing payload preview",
  "Signing message": "Signing message",
  "Unable to decode signing payload.": "Unable to decode signing payload.",
  Collateral: "Collateral",
  "Privacy fee": "Privacy fee",
  Market: "Market",
  Outcome: "Outcome",
  "Preparing private trade proof...": "Preparing private trade proof...",
  "Private trade proof sent.": "Private trade proof sent.",
  "IrohaConnect approved.": "IrohaConnect approved.",
  "Scan screen QR": "Scan screen QR",
  "Scanning screen...": "Scanning screen...",
  "Choose the screen or window that contains the QR code.":
    "Choose the screen or window that contains the QR code.",
  "Scan a visible IrohaConnect QR from another app window, or upload a saved QR image.":
    "Scan a visible IrohaConnect QR from another app window, or upload a saved QR image.",
  "No QR code found on the selected screen.":
    "No QR code found on the selected screen.",
  "Screen capture is not supported in this environment.":
    "Screen capture is not supported in this environment.",
  "Screen QR scan cancelled.": "Screen QR scan cancelled.",
  "Unable to capture a screen frame.": "Unable to capture a screen frame.",
  "Unable to read QR from screen.": "Unable to read QR from screen.",
  Fee: "Fee",
  "Charged on-chain": "Charged on-chain",
  "Network fee: {amount} {asset}.": "Network fee: {amount} {asset}.",
  "Network fee: {amount} {asset} (estimated).":
    "Network fee: {amount} {asset} (estimated).",
  "Network fee: charged on-chain ({asset}).":
    "Network fee: charged on-chain ({asset}).",
  "Network fee: charged on-chain (amount unavailable).":
    "Network fee: charged on-chain (amount unavailable).",
  "Meeting creation finalized in block {block}: {hash}":
    "Meeting creation finalized in block {block}: {hash}",
  "Meeting join finalized in block {block}: {hash}":
    "Meeting join finalized in block {block}: {hash}",
  "Meeting end finalized in block {block}: {hash}":
    "Meeting end finalized in block {block}: {hash}",
  "Open explorer": "Open explorer",
  "Live supply, holder concentration, and consensus telemetry for the active public lane.":
    "Live supply, holder concentration, and consensus telemetry for the active public lane.",
  "The active network is publishing live explorer, supply, and consensus data for the XOR lane.":
    "The active network is publishing live explorer, supply, and consensus data for the XOR lane.",
  "Querying explorer and status surfaces.":
    "Querying explorer and status surfaces.",
  "Unable to load network stats.": "Unable to load network stats.",
  "Network connection ready": "Network connection ready",
  "Network connection is unavailable. Reload and try again.":
    "Network connection is unavailable. Reload and try again.",
  "Prepare proposal": "Prepare proposal",
  "Contract target": "Contract target",
  "Contract address": "Contract address",
  "Contract alias": "Contract alias",
  "Code hash": "Code hash",
  "ABI hash": "ABI hash",
  "ABI version": "ABI version",
  "Window lower": "Window lower",
  "Window upper": "Window upper",
  "Limits JSON": "Limits JSON",
  "Prepare draft": "Prepare draft",
  "Set both window bounds or leave both empty.":
    "Set both window bounds or leave both empty.",
  "Limits JSON must be a JSON object.": "Limits JSON must be a JSON object.",
  "Invalid limits JSON.": "Invalid limits JSON.",
  "Enter a contract target, code hash, and ABI hash first.":
    "Enter a contract target, code hash, and ABI hash first.",
  "Current Height": "Current Height",
  "Expired Locks": "Expired Locks",
  "Last Sweep": "Last Sweep",
  "Council members": "Council members",
  "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not an on-chain dataspace alias.":
    "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not an on-chain dataspace alias.",
  "Request starter XOR from the active network faucet.":
    "Request starter XOR from the active network faucet.",
  "Minamoto mainnet has no faucet. Use TAIRA testnet to request starter XOR.":
    "Minamoto mainnet has no faucet. Use TAIRA testnet to request starter XOR.",
  "Use TAIRA faucet": "Use TAIRA faucet",
  "Request XOR": "Request XOR",
  Cancel: "Cancel",
  "Canceling…": "Canceling…",
  "Faucet request canceled.": "Faucet request canceled.",
  "Waiting for the network to expose the funded asset in account balances.":
    "Waiting for the network to expose the funded asset in account balances.",
  "The network dropped the previous queued faucet claim before commit. Retrying automatically with backoff.":
    "The network dropped the previous queued faucet claim before commit. Retrying automatically with backoff.",
  "The network dropped the previous queued faucet claim before finality. Retrying automatically with backoff.":
    "The network dropped the previous queued faucet claim before finality. Retrying automatically with backoff.",
  "Faucet transaction finalized. Updating wallet…":
    "Faucet transaction finalized. Updating wallet…",
  "Faucet transaction finalized, but wallet balances are still indexing. Refresh again in a few seconds.":
    "Faucet transaction finalized, but wallet balances are still indexing. Refresh again in a few seconds.",
  "Transaction finalized — settlement indexing":
    "Transaction finalized — settlement indexing",
  "Your faucet request is in flight. This can take a few seconds.":
    "Your faucet request is in flight. This can take a few seconds.",
  "XOR requested: {hash}": "XOR finalized on-chain: {hash}",
  "Live services": "Live services",
  "Last refresh": "Last refresh",
  "SoraCloud is not available on this endpoint yet.":
    "SoraCloud is not available on this endpoint yet.",
  "Choose a Torii endpoint that exposes /v1/soracloud, then refresh this page.":
    "Choose a Torii endpoint that exposes /v1/soracloud, then refresh this page.",
  "Could not load SoraCloud.": "Could not load SoraCloud.",
  "Checking SoraCloud...": "Checking SoraCloud...",
  Refreshing: "Refreshing",
  "Open Settings": "Open Settings",
  "Choose model": "Choose model",
  "Lease and payment": "Lease and payment",
  "Hugging Face repo": "Hugging Face repo",
  "owner/model-name": "owner/model-name",
  Revision: "Revision",
  "Model name": "Model name",
  "Service name": "Service name",
  "Use 3-64 lowercase letters, numbers, underscores, or hyphens, starting with a letter.":
    "Use 3-64 lowercase letters, numbers, underscores, or hyphens, starting with a letter.",
  "Storage class": "Storage class",
  Warm: "Warm",
  Hot: "Hot",
  Cold: "Cold",
  "Lease duration": "Lease duration",
  "1 hour": "1 hour",
  "24 hours": "24 hours",
  "7 days": "7 days",
  "Settlement asset": "Settlement asset",
  "Use the canonical asset definition ID, not an alias.":
    "Use the canonical asset definition ID, not an alias.",
  "If this is empty, claim XOR in Wallet first.":
    "If this is empty, claim XOR in Wallet first.",
  "Settlement asset must be a canonical asset definition ID.":
    "Settlement asset must be a canonical asset definition ID.",
  "Base fee nanos": "Base fee nanos",
  "API token": "API token",
  "Optional. Used only for this request and never saved.":
    "Optional. Used only for this request and never saved.",
  Repo: "Repo",
  Required: "Required",
  Service: "Service",
  Lease: "Lease",
  "{count} hours": "{count} hours",
  "Base fee": "Base fee",
  Back: "Back",
  Next: "Next",
  "Only records returned by the active Torii endpoint are shown.":
    "Only records returned by the active Torii endpoint are shown.",
  "{count} revisions": "{count} revisions",
  "No SoraCloud services found on this endpoint.":
    "No SoraCloud services found on this endpoint.",
  "Live services will appear after SoraCloud is available.":
    "Live services will appear after SoraCloud is available.",
  Diagnostics: "Diagnostics",
  API: "API",
  "Status code": "Status code",
  OK: "OK",
  "Audit events": "Audit events",
  Schema: "Schema",
  "Status payload": "Status payload",
  Checking: "Checking",
  "Live API ready": "Live API ready",
  "API unavailable": "API unavailable",
  "Connection error": "Connection error",
  "Not refreshed": "Not refreshed",
  "Create or restore a wallet first.": "Create or restore a wallet first.",
  Payments: "Payments",
  Tools: "Tools",
  "Create wallet": "Create wallet",
  "Advanced settings": "Advanced settings",
  "Supply, activity, and explorer signals":
    "Supply, activity, and explorer signals",
  "Stake XOR": "Stake XOR",
  "Choose a validator and manage stake": "Choose a validator and manage stake",
  "Choose a validator, enter an amount, and manage your stake.":
    "Choose a validator, enter an amount, and manage your stake.",
  "Recurring payments": "Recurring payments",
  "Live subscription NFTs and plan metadata from TAIRA.":
    "Live subscription NFTs and plan metadata from TAIRA.",
  "Live Torii data": "Live Torii data",
  "Past due": "Past due",
  "Plan catalog": "Plan catalog",
  "Refresh to sync real subscription state from Torii.":
    "Refresh to sync real subscription state from Torii.",
  "This wallet is local-only. Subscription records appear after the account exists on-chain.":
    "This wallet is local-only. Subscription records appear after the account exists on-chain.",
  "Subscribe to plan": "Subscribe to plan",
  "Create a real subscription NFT for an existing on-chain plan.":
    "Create a real subscription NFT for an existing on-chain plan.",
  "Plan ID": "Plan ID",
  "Select plan": "Select plan",
  "Manual plan ID": "Manual plan ID",
  "Subscription NFT ID": "Subscription NFT ID",
  "First charge time": "First charge time",
  "Create subscription": "Create subscription",
  "Available plans": "Available plans",
  "Provider: {value}": "Provider: {value}",
  "No live plans found.": "No live plans found.",
  "Owned subscription NFTs for the active wallet.":
    "Owned subscription NFTs for the active wallet.",
  "Period end: {date}": "Period end: {date}",
  "Subscription details": "Subscription details",
  Provider: "Provider",
  "Billing trigger": "Billing trigger",
  "Charge now": "Charge now",
  "This account has no subscriptions on TAIRA.":
    "This account has no subscriptions on TAIRA.",
  "Loaded from TAIRA at {time}": "Loaded from TAIRA at {time}",
  Suspended: "Suspended",
  unknown: "unknown",
  "Last invoice: {amount} {unit} ({status})":
    "Last invoice: {amount} {unit} ({status})",
  "First charge time is invalid.": "First charge time is invalid.",
  "Enter a plan ID.": "Enter a plan ID.",
  "Subscription submitted: {hash}": "Subscription finalized on-chain: {hash}",
  "Subscription action submitted: {hash}":
    "Subscription action finalized on-chain: {hash}",
  "Price unavailable": "Price unavailable",
  "{unit} {amount} per {usage}": "{unit} {amount} per {usage}",
  "{count} day period": "{count} day period",
  unit: "unit",
  "Secure backup": "Secure backup",
  "Wallet status": "Wallet status",
  "Recovery phrase ready": "Recovery phrase ready",
  "Wallet name": "Wallet name",
  "Wallet details": "Wallet details",
  "I105 Account ID": "I105 Account ID",
  "Advanced wallet details": "Advanced wallet details",
  "Back up recovery phrase": "Back up recovery phrase",
  "Copy phrase": "Copy phrase",
  "Recovery phrase copied to clipboard.":
    "Recovery phrase copied to clipboard.",
  "Clipboard access failed. Copy the phrase manually.":
    "Clipboard access failed. Copy the phrase manually.",
  "Phone pairing": "Phone pairing",
  "Pairing details": "Pairing details",
  "Available balance": "Available balance",
  "Starter funds": "Starter funds",
  "Private balance": "Private balance",
  "Standard balance": "Standard balance",
  "Private balance details": "Private balance details",
  "Rescan private balance": "Rescan private balance",
  "Asset and account details": "Asset and account details",
  "Stop scanner": "Stop scanner",
  "Scan payment QR": "Scan payment QR",
  "Upload QR image": "Upload QR image",
  "Copy address": "Copy address",
  From: "From",
  Balance: "Balance",
  "or upload a QR image": "or upload a QR image",
  "Send mode": "Send mode",
  Private: "Private",
  Recipient: "Recipient",
  "Resolving recipient…": "Resolving recipient…",
  "Alias {alias} resolves to {accountId}.":
    "Alias {alias} resolves to {accountId}.",
  "Recipient normalized to {accountId}.":
    "Recipient normalized to {accountId}.",
  "Unable to resolve recipient.": "Unable to resolve recipient.",
  "Private address": "Private address",
  "Show a fresh QR for this wallet.": "Show a fresh QR for this wallet.",
  "Hide QR": "Hide QR",
  "Show QR": "Show QR",
  "Share QR": "Share QR",
  "This QR creates a private payment address for the next sender.":
    "This QR creates a private payment address for the next sender.",
  "Use the button above when someone is ready to pay you.":
    "Use the button above when someone is ready to pay you.",
  "QR shared.": "QR shared.",
  "QR payload copied to clipboard.": "QR payload copied to clipboard.",
  "Private address copied.": "Private address copied.",
  "Private address copy failed.": "Private address copy failed.",
  "QR share failed.": "QR share failed.",
  "Staking group": "Staking group",
  "Staking details": "Staking details",
  "Stake / Unstake": "Stake / Unstake",
  Citizenship: "Citizenship",
  Citizens: "Citizens",
  "Checking citizenship…": "Checking citizenship…",
  "You are a citizen": "You are a citizen",
  "Not a citizen yet": "Not a citizen yet",
  "Citizen status unavailable": "Citizen status unavailable",
  "Bonded {amount} XOR": "Bonded {amount} XOR",
  "Citizenship: {state}": "Citizenship: {state}",
  "Citizenship registered.": "Citizenship registered.",
  registered: "registered",
  "Load proposal": "Load proposal",
  "Raw proposal data": "Raw proposal data",
  "VPN details": "VPN details",
  "Session details": "Session details",
  "Network profile": "Network profile",
  "1. Set up device wallet": "1. Set up device wallet",
  "3. Request payment": "3. Request payment",
  "4. Pay an invoice": "4. Pay an invoice",
  "Payment details": "Payment details",
  "5. Accept payment": "5. Accept payment",
  "Move to online wallet": "Move to online wallet",
  "Start or join a wallet-based meeting link.":
    "Start or join a wallet-based meeting link.",
  "Connection details": "Connection details",
  "Turn on camera and mic": "Turn on camera and mic",
  "Camera and mic": "Camera and mic",
  Camera: "Camera",
  Microphone: "Microphone",
  "Auto-select camera": "Auto-select camera",
  "Default camera": "Default camera",
  "Default microphone": "Default microphone",
  "Refresh devices": "Refresh devices",
  "Retry camera": "Retry camera",
  "Find working camera": "Find working camera",
  "Checking media": "Checking media",
  "Finding camera": "Finding camera",
  "Preview live": "Preview live",
  "Permission needed": "Permission needed",
  "No video frames": "No video frames",
  "No devices": "No devices",
  "Devices found": "Devices found",
  "Not checked": "Not checked",
  "Camera {number}": "Camera {number}",
  "Microphone {number}": "Microphone {number}",
  "Media devices refreshed.": "Media devices refreshed.",
  "Media device selection updated.": "Media device selection updated.",
  "Unable to refresh media devices: {message}":
    "Unable to refresh media devices: {message}",
  "Checking cameras and microphones.": "Checking cameras and microphones.",
  "Allow Camera and Microphone for this app in System Settings, then retry.":
    "Allow Camera and Microphone for this app in System Settings, then retry.",
  "The camera opened but no video frames arrived. Choose another camera or close apps using it, then retry.":
    "The camera opened but no video frames arrived. Choose another camera or close apps using it, then retry.",
  "No working camera produced video. Close apps using the camera, then find a working camera again.":
    "No working camera produced video. Close apps using the camera, then find a working camera again.",
  "No camera or microphone device was found.":
    "No camera or microphone device was found.",
  "Preview is live. Create or join when ready.":
    "Preview is live. Create or join when ready.",
  "Using {camera}. Create or join when ready.":
    "Using {camera}. Create or join when ready.",
  "Choose a camera and microphone, then turn them on before creating or joining.":
    "Choose a camera and microphone, then turn them on before creating or joining.",
  "Kaigi will try each camera and use the first one with video.":
    "Kaigi will try each camera and use the first one with video.",
  "Camera opened but no video frames arrived. Choose another camera, close apps using the camera, then retry.":
    "Camera opened but no video frames arrived. Choose another camera, close apps using the camera, then retry.",
  "No working camera produced video frames. Close other camera apps, then retry.":
    "No working camera produced video frames. Close other camera apps, then retry.",
  "Local media is ready. Using {camera}.":
    "Local media is ready. Using {camera}.",
  "Camera or microphone permission was denied. Allow Camera and Microphone for this app in System Settings, then retry.":
    "Camera or microphone permission was denied. If no prompt appears, grant Camera and Microphone for this app in System Settings, then restart the app and retry.",
  "Selected camera or microphone is unavailable. Choose another device.":
    "Selected camera or microphone is unavailable. Choose another device.",
  "Explorer QR": "Explorer QR",
  "Use this QR when another wallet or explorer needs this account.":
    "Use this QR when another wallet or explorer needs this account.",
  "QR details": "QR details",
  Sections: "Sections",
  "Network health": "Network health",
  "Network load": "Network load",
  "Live network status": "Live network status",
  "Holder concentration": "Holder concentration",
  "Private exit": "Private exit",
  "Private exit is unavailable for the current asset definition.":
    "Private exit is unavailable for the current asset definition.",
  "{operation} is unavailable for the current asset definition.":
    "{operation} is unavailable for the current asset definition.",
  "{operation} is unavailable: effective policy mode is {mode}.":
    "{operation} is unavailable: effective policy mode is {mode}.",
  "{operation} is disabled by the asset policy.":
    "{operation} is disabled by the asset policy.",
  "{operation} is unavailable because the asset policy is missing vk_transfer.":
    "{operation} is unavailable because the asset policy is missing vk_transfer.",
  "{operation} policy check failed: {message}. Submission may still fail if the current asset policy does not allow it.":
    "{operation} policy check failed: {message}. Submission may still fail if the current asset policy does not allow it.",
  "{operation} policy check failed. Submission may still fail if the current asset policy does not allow it.":
    "{operation} policy check failed. Submission may still fail if the current asset policy does not allow it.",
  "{operation} is unavailable because its policy could not be verified: {message}.":
    "{operation} is unavailable because its policy could not be verified: {message}.",
  "{operation} is unavailable because its policy could not be verified.":
    "{operation} is unavailable because its policy could not be verified.",
  "QR encodes only a fresh private payment address. Account, asset, and amount stay off the QR by default.":
    "QR encodes only a fresh private payment address. Account, asset, and amount stay off the QR by default.",
  "Transaction finalized on-chain: {hash}":
    "Transaction finalized on-chain: {hash}",
  "Secure OS-backed key storage is unavailable on this device.":
    "Secure OS-backed key storage is unavailable on this device.",
  "Enter an identity private key first.":
    "Enter an identity private key first.",
  "Identity saved to secure storage.": "Identity saved to secure storage.",
  "Enter an authority private key first.":
    "Enter an authority private key first.",
  "Authority saved to secure storage.": "Authority saved to secure storage.",
  "Transparent balance": "Transparent balance",
  "Showing private notes recognized by this wallet. Older or foreign confidential outputs may be missing, so this total is not guaranteed complete or spendable in this release.":
    "Showing private notes recognized by this wallet. Older or foreign confidential outputs may be missing, so this total is not guaranteed complete or spendable in this release.",
  "Scanning private notes…": "Scanning private notes…",
  "Private note scan complete.": "Private note scan complete.",
  "Private note scan failed.": "Private note scan failed.",
  "global note index": "global note index",
  "account history fallback": "account history fallback",
  "current available history": "current available history",
  "block {block}": "block {block}",
  "Recovered {count} private note(s) from {source} through {watermark}.":
    "Recovered {count} private note(s) from {source} through {watermark}.",
  "Global note index is unavailable, so recovery is limited to this account history through {watermark}.":
    "Global note index is unavailable, so recovery is limited to this account history through {watermark}.",
  "Some confidential activity could not be decrypted from on-chain note envelopes; balance may be incomplete.":
    "Some confidential activity could not be decrypted from on-chain note envelopes; balance may be incomplete.",
  "Create on-chain account": "Authority-only registration",
  "Requires authority credentials to create the account on-chain.":
    "Advanced tool. Requires authority credentials. Regular wallets are created from Create Wallet.",
  "Set up network and wallet first.": "Set up network and wallet first.",
  Settings: "Settings",
  "Endpoint and app preferences": "Endpoint and app preferences",
  "Torii endpoint": "Torii endpoint",
  "Choose the Torii endpoint used for wallet, staking, governance, VPN, and explorer requests.":
    "Choose the Torii endpoint used for wallet, staking, governance, VPN, and explorer requests.",
  "Current endpoint": "Current endpoint",
  "Default endpoint": "Default endpoint",
  "Custom endpoint": "Custom endpoint",
  "Chain ID and account prefix are loaded from Torii when you check and save the endpoint.":
    "Chain ID and account prefix are loaded from Torii when you check and save the endpoint.",
  "The chain ID and account prefix are the expected wallet target. Endpoint checks never retarget them.":
    "The chain ID and account prefix are the expected wallet target. Endpoint checks never retarget them.",
  "Checking endpoint identity…": "Checking endpoint identity…",
  "Confirming the endpoint matches the configured network.":
    "Confirming the endpoint matches the configured network.",
  "Endpoint offline": "Endpoint offline",
  "Writes authorized": "Writes authorized",
  "Writes blocked": "Writes blocked",
  "Endpoint identity could not be verified. Reads remain available.":
    "Endpoint identity could not be verified. Reads remain available.",
  "Endpoint identity inspection has not authorized writes.":
    "Endpoint identity inspection has not authorized writes.",
  "Wait for endpoint capability inspection to finish.":
    "Wait for endpoint capability inspection to finish.",
  "Writes are blocked until the endpoint identity is verified.":
    "Writes are blocked until the endpoint identity is verified.",
  "Wait for endpoint capability inspection to finish before moving funds to the private balance.":
    "Wait for endpoint capability inspection to finish before moving funds to the private balance.",
  "Private balance writes are blocked until the endpoint identity is verified.":
    "Private balance writes are blocked until the endpoint identity is verified.",
  "This endpoint does not advertise the required VPN session operations.":
    "This endpoint does not advertise the required VPN session operations.",
  "Failed to load local VPN controller state.":
    "Failed to load local VPN controller state.",
  "Failed to load VPN network state.": "Failed to load VPN network state.",
  "Local controller available": "Local controller available",
  "The local VPN controller is ready. Set up a network and wallet to connect.":
    "The local VPN controller is ready. Set up a network and wallet to connect.",
  "The local VPN controller requires repair.":
    "The local VPN controller requires repair.",
  "This endpoint does not advertise the required asset transfer operations.":
    "This endpoint does not advertise the required asset transfer operations.",
  "This endpoint does not advertise the required confidential transfer operations.":
    "This endpoint does not advertise the required confidential transfer operations.",
  "Automatic Kaigi signaling is blocked until the endpoint identity is verified. Manual signaling remains available.":
    "Automatic Kaigi signaling is blocked until the endpoint identity is verified. Manual signaling remains available.",
  "Consensus telemetry is unavailable.": "Consensus telemetry is unavailable.",
  "Failed to load lane stake.": "Failed to load lane stake.",
  "Failed to load pending rewards.": "Failed to load pending rewards.",
  "Failed to load wallet stake.": "Failed to load wallet stake.",
  "No live plans found": "No live plans found",
  "No public lanes found on this Torii endpoint.":
    "No public lanes found on this Torii endpoint.",
  "Subscription writes unavailable": "Subscription writes unavailable",
  "SoraCloud HF shared lease": "SoraCloud HF shared lease",
  "Monitor live SoraCloud services": "Monitor live SoraCloud services",
  "HF shared lease": "HF shared lease",
  "Hugging Face shared lease": "Hugging Face shared lease",
  "Inspect the exact shared-lease source, pool, and wallet membership reported by Torii.":
    "Inspect the exact shared-lease source, pool, and wallet membership reported by Torii.",
  "Full commit revision": "Full commit revision",
  "Check shared lease": "Check shared lease",
  "Select a SoraCloud-enabled endpoint before checking a lease.":
    "Select a SoraCloud-enabled endpoint before checking a lease.",
  "This endpoint does not advertise the exact /v1/soracloud/hf/lease contract.":
    "This endpoint does not advertise the exact /v1/soracloud/hf/lease contract.",
  "Enter an exact repo and full 40-character commit revision.":
    "Enter an exact repo and full 40-character commit revision.",
  "Lease joining is read-only": "Lease joining is read-only",
  "This release will not post a lease join until the current Iroha SDK exports the exact canonical Norito provenance encoder and signer required by Torii.":
    "This release will not post a lease join until the current Iroha SDK exports the exact canonical Norito provenance encoder and signer required by Torii.",
  "Join shared lease unavailable": "Join shared lease unavailable",
  Source: "Source",
  "Resolved revision": "Resolved revision",
  Pool: "Pool",
  "No lease pool": "No lease pool",
  Membership: "Membership",
  "Not a member": "Not a member",
  "Service bindings": "Service bindings",
  "HF source not found": "HF source not found",
  "This endpoint does not advertise {operation}.":
    "This endpoint does not advertise {operation}.",
  Found: "Found",
  "Not found": "Not found",
  "This endpoint does not advertise the Kaigi meeting write operations. Manual signaling remains available.":
    "This endpoint does not advertise the Kaigi meeting write operations. Manual signaling remains available.",
  "This endpoint does not advertise the required subscription write operations.":
    "This endpoint does not advertise the required subscription write operations.",
  "This Torii endpoint has no subscription plans to subscribe to.":
    "This Torii endpoint has no subscription plans to subscribe to.",
  "Unbond scheduling is unavailable because policy is not public.":
    "Unbond scheduling is unavailable because policy is not public.",
  "Wait for endpoint capability inspection to finish. Manual signaling remains available.":
    "Wait for endpoint capability inspection to finish. Manual signaling remains available.",
  "Wallet stake balance is unavailable.":
    "Wallet stake balance is unavailable.",
  "The active endpoint does not advertise governance write operations.":
    "The active endpoint does not advertise governance write operations.",
  "The active endpoint does not advertise IrohaConnect session writes.":
    "The active endpoint does not advertise IrohaConnect session writes.",
  "Open settings": "Open settings",
  "Read only": "Read only",
  "Read and write": "Read and write",
  "Access mode": "Access mode",
  "Observed chain": "Observed chain",
  "Observed network prefix": "Observed network prefix",
  "Last checked": "Last checked",
  "Not observed": "Not observed",
  "Endpoint write features": "Endpoint write features",
  Supported: "Supported",
  "Account registration": "Account registration",
  "Account onboarding": "Account onboarding",
  "Asset transfers": "Asset transfers",
  "Faucet claims": "Faucet claims",
  "Confidential transfers": "Confidential transfers",
  "Kaigi meetings": "Kaigi meetings",
  "Governance writes": "Governance writes",
  "Staking writes": "Staking writes",
  "Subscription writes": "Subscription writes",
  "VPN sessions": "VPN sessions",
  "IrohaConnect sessions": "IrohaConnect sessions",
  "Check endpoint": "Check endpoint",
  "Check & Save": "Check & Save",
  "Checking…": "Checking…",
  "Save endpoint": "Save endpoint",
  "Save without checking": "Save without checking",
  "Reset to default": "Reset to default",
  "Endpoint saved.": "Endpoint saved.",
  "Endpoint checked and saved.": "Endpoint checked and saved.",
  "Endpoint checked and chain settings saved.":
    "Endpoint checked and chain settings saved.",
  "Endpoint identity verified and saved.":
    "Endpoint identity verified and saved.",
  "Endpoint saved in read-only mode: {message}":
    "Endpoint saved in read-only mode: {message}",
  "Default endpoint restored.": "Default endpoint restored.",
  "Endpoint responded successfully.": "Endpoint responded successfully.",
  "No response from endpoint.": "No response from endpoint.",
  "Unable to load chain metadata from Torii.":
    "Unable to load chain metadata from Torii.",
  "Unable to inspect endpoint identity.":
    "Unable to inspect endpoint identity.",
  "Enter a Torii endpoint URL.": "Enter a Torii endpoint URL.",
  "Enter a valid Torii endpoint URL.": "Enter a valid Torii endpoint URL.",
  "Endpoint must start with http:// or https://.":
    "Endpoint must start with http:// or https://.",
  Stats: "Stats",
  "Stats HUD": "Stats HUD",
  Overview: "Overview",
  "At a glance": "At a glance",
  "Fast path": "Fast path",
  "Quick find": "Quick find",
  "Live telemetry panel": "Live telemetry panel",
  "Consensus runway": "Consensus runway",
  Finalized: "Finalized",
  Pending: "Pending",
  Current: "Current",
  "XOR supply, holder concentration, and live chain telemetry":
    "XOR supply, holder concentration, and live chain telemetry",
  "XOR supply, flow, and consensus telemetry":
    "XOR supply, flow, and consensus telemetry",
  "XOR supply": "XOR supply",
  "Live supply, holder concentration, and consensus telemetry for the TAIRA public lane.":
    "Live supply, holder concentration, and consensus telemetry for the TAIRA public lane.",
  Holders: "Holders",
  Peers: "Peers",
  Accounts: "Accounts",
  Assets: "Assets",
  Domains: "Domains",
  "Top 10 share": "Top 10 share",
  "Queue fill": "Queue fill",
  "As of {time}": "As of {time}",
  Signal: "Signal",
  Consensus: "Consensus",
  "Runtime pressure": "Runtime pressure",
  "Live Torii status": "Live Torii status",
  Flow: "Flow",
  "Velocity and issuance": "Velocity and issuance",
  "1h / 24h / 7d windows": "1h / 24h / 7d windows",
  Velocity: "Velocity",
  "{transfers} transfers · {senders} senders · {receivers} receivers":
    "{transfers} transfers · {senders} senders · {receivers} receivers",
  Issuance: "Issuance",
  "Minted {minted}": "Minted {minted}",
  "Burned {burned}": "Burned {burned}",
  "Minted {minted} · burned {burned}": "Minted {minted} · burned {burned}",
  "30 day issuance pulse": "30 day issuance pulse",
  "Bars show the absolute net issuance per day so supply shocks are visible at a glance.":
    "Bars show the absolute net issuance per day so supply shocks are visible at a glance.",
  "Daily net issuance chart for the visible econometrics window.":
    "Daily net issuance chart for the visible econometrics window.",
  Distribution: "Distribution",
  "Whale map": "Whale map",
  Concentration: "Concentration",
  "Lorenz curve": "Lorenz curve",
  "Even distribution": "Even distribution",
  "Observed supply": "Observed supply",
  "Lorenz curve for observed XOR holder distribution.":
    "Lorenz curve for observed XOR holder distribution.",
  "Top holders": "Top holders",
  Gini: "Gini",
  "0 is even, 1 is extremely concentrated.":
    "0 is even, 1 is extremely concentrated.",
  HHI: "HHI",
  "Higher values mean more supply concentration.":
    "Higher values mean more supply concentration.",
  "Nakamoto 51": "Nakamoto 51",
  "Minimum holders needed to control 51% of supply.":
    "Minimum holders needed to control 51% of supply.",
  "Top 1 share": "Top 1 share",
  "Share held by the single largest account.":
    "Share held by the single largest account.",
  "Median holder": "Median holder",
  "Midpoint holder balance across the distribution.":
    "Midpoint holder balance across the distribution.",
  "P99 holder": "P99 holder",
  "Balance threshold for the top 1% of holders.":
    "Balance threshold for the top 1% of holders.",
  "Booting telemetry": "Booting telemetry",
  "Partial telemetry": "Partial telemetry",
  "Live telemetry": "Live telemetry",
  "Waiting for signal": "Waiting for signal",
  "Finality runway: {pending} blocks pending between finalized and current height.":
    "Finality runway: {pending} blocks pending between finalized and current height.",
  "Queue pressure": "Queue pressure",
  "Queued transactions versus reported queue capacity.":
    "Queued transactions versus reported queue capacity.",
  "Finality gap": "Finality gap",
  "Accepted share": "Accepted share",
  "Accepted transactions as a share of accepted plus rejected totals.":
    "Accepted transactions as a share of accepted plus rejected totals.",
  "Queue saturation signal unavailable.":
    "Queue saturation signal unavailable.",
  "Ingress is at the saturation threshold.":
    "Ingress is at the saturation threshold.",
  "Ingress is below saturation.": "Ingress is below saturation.",
  "Finality lag": "Finality lag",
  "Current block height minus finalized height.":
    "Current block height minus finalized height.",
  "Commit time": "Commit time",
  "Observed transaction commit latency.":
    "Observed transaction commit latency.",
  "Block cadence": "Block cadence",
  "Effective block time after current pacing.":
    "Effective block time after current pacing.",
  "Pressure gauges": "Pressure gauges",
  "Accepted tx": "Accepted tx",
  "Rejected tx": "Rejected tx",
  "Activity totals": "Activity totals",
  "Network shape": "Network shape",
  "Validator posture": "Validator posture",
  Lanes: "Lanes",
  Dataspaces: "Dataspaces",
  Validators: "Validators",
  "Block height": "Block height",
  "Finalized height": "Finalized height",
  "Highest QC": "Highest QC",
  "TAIRA is publishing live explorer, supply, and consensus data for the XOR lane.":
    "TAIRA is publishing live explorer, supply, and consensus data for the XOR lane.",
  "Querying TAIRA explorer and status surfaces.":
    "Querying TAIRA explorer and status surfaces.",
  "Unable to load TAIRA stats.": "Unable to load TAIRA stats.",
  "Create and save your TAIRA wallet": "Create and save your TAIRA wallet",
  "Generate your account keys, store a recovery phrase, and save the wallet locally.":
    "Create keys, back up your phrase, and save the wallet.",
  "Generate your account keys, store a recovery phrase, and save the wallet locally. Torii registration is optional.":
    "Create keys, back up your phrase, and save the wallet. Registration is optional.",
  "Generate your account keys, store a recovery phrase, and save the wallet locally. On-chain alias registration is optional.":
    "Create keys, back up your phrase, and save the wallet. Alias is optional.",
  "Restore your wallet from a recovery phrase and save it locally.":
    "Restore a wallet from your phrase and save it locally.",
  "Restore from recovery phrase": "Restore from phrase",
  "Edit recovery phrase": "Edit recovery phrase",
  "Paste a 12- or 24-word recovery phrase to derive the same wallet keys locally.":
    "Paste a 12- or 24-word phrase to derive this wallet locally.",
  "Create recovery phrase": "Create recovery phrase",
  "Hide restore": "Hide restore",
  "Recovery Phrase": "Recovery phrase",
  "Load recovery phrase": "Load phrase",
  "Import backup JSON": "Import backup JSON",
  "Restoring…": "Restoring…",
  Advanced: "Advanced",
  "Hide advanced": "Hide advanced",
  "Optional on-chain alias registration": "Optional alias",
  "This submits the UAID alias registration flow when the endpoint supports it. Your wallet already works without this step.":
    "Register an alias if you want one. The wallet works without it.",
  "Alias Metadata (JSON, optional)": "Alias metadata",
  "Register on-chain alias": "Register alias",
  "Registering alias…": "Registering alias…",
  "On-chain alias {accountId} queued (tx {txHash}…)":
    "Alias queued: {accountId} ({txHash}...)",
  "On-chain alias registration is unavailable on this Torii endpoint. The wallet was saved locally instead.":
    "Alias registration is unavailable here. Wallet saved locally.",
  "On-chain alias registration is unavailable on this Torii endpoint. The wallet was still saved locally.":
    "Alias registration is unavailable here. Wallet saved locally.",
  "Saved Wallets": "Wallets",
  "Switch between saved wallets or begin a fresh wallet setup.":
    "Switch wallets or create one.",
  "No saved wallets yet. Complete the wallet setup form to add one.":
    "No saved wallets yet.",
  "Add another wallet": "Add wallet",
  "Switch between saved profiles or begin a fresh wallet setup.":
    "Switch between saved profiles or begin a fresh wallet setup.",
  "No saved accounts yet. Complete the wallet setup form to add one.":
    "No saved accounts yet. Complete the wallet setup form to add one.",
  default: "default",
  "Canonical I105 Account ID": "I105 Account ID",
  "Canonical I105 account IDs are compact literals and may look like 6cmz..., not i105:.":
    "Real TAIRA I105 account IDs are kana-based literals and may look like testu..., not 6cmz... or i105:.",
  "Edit raw asset ID": "Edit raw asset ID",
  "Raw asset ID": "Raw asset ID",
  "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not a TAIRA dataspace alias.":
    "{domain} is local only.",
  "Enter a recovery phrase.": "Enter a recovery phrase.",
  "Recovery phrase must contain 12 or 24 words.":
    "Recovery phrase must contain 12 or 24 words.",
  "Invalid recovery phrase": "Invalid recovery phrase",
  "Invalid backup file.": "Invalid backup file.",
  "Backup file is missing a recovery phrase.":
    "Backup file is missing a recovery phrase.",
  "Recovery phrase confirmed": "Phrase confirmed",
  "Faucet Request": "Faucet Request",
  "Top up a new TAIRA account once with starter XOR.":
    "Top up a new TAIRA account once with starter XOR.",
  "Claim 25,000 TAIRA testnet XOR for governance and testing.":
    "Claim 25,000 TAIRA testnet XOR for governance and testing.",
  "Claim Testnet XOR": "Claim Testnet XOR",
  "Requesting…": "Requesting…",
  "Faucet request in progress": "Faucet request in progress",
  "Requesting faucet puzzle…": "Requesting faucet puzzle…",
  "Waiting for finalized faucet seed data…":
    "Waiting for finalized faucet seed data…",
  "Solving faucet proof-of-work…": "Solving faucet proof-of-work…",
  "Submitting faucet claim…": "Submitting faucet claim…",
  "Retrying faucet claim after queue expiry…":
    "Retrying faucet claim after queue expiry…",
  "Faucet claim accepted. Updating wallet…":
    "Faucet claim accepted. Updating wallet…",
  "Faucet claim accepted. Waiting for finality…":
    "Faucet claim accepted. Waiting for finality…",
  "Waiting for faucet transaction finality…":
    "Waiting for faucet transaction finality…",
  "Faucet transaction committed. Updating wallet…":
    "Faucet transaction finalized. Updating wallet…",
  "Refreshing wallet balance…": "Refreshing wallet balance…",
  "Your TAIRA faucet request is in flight. This can take a few seconds.":
    "Your TAIRA faucet request is in flight. This can take a few seconds.",
  "TAIRA dropped the previous queued faucet claim before commit. Retrying automatically with backoff.":
    "TAIRA dropped the previous queued faucet claim before commit. Retrying automatically with backoff.",
  "Waiting for TAIRA to expose the funded asset in account balances.":
    "Waiting for TAIRA to expose the funded asset in account balances.",
  "Testnet XOR requested: {hash}": "Testnet XOR requested: {hash}",
  "Faucet accepted, but wallet balances are still indexing. Refresh again in a few seconds.":
    "Faucet transaction finalized, but wallet balances are still indexing. Refresh again in a few seconds.",
  "Failed to request faucet funds.": "Failed to request faucet funds.",
  "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or registered.":
    "This wallet is local only. Balances stay empty until it is live on-chain.",
  "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or otherwise created on-chain.":
    "This wallet is local only. Balances stay empty until it is funded or otherwise created on-chain.",
  "Wallet data is unavailable until this account exists on-chain.":
    "No on-chain wallet data yet.",
  "Unable to reach Torii.": "Could not reach Torii.",
  "Failed to create the on-chain account.":
    "Could not create the on-chain account.",
  "Failed to save the authority account.":
    "Could not save the authority account.",
  "Account {accountId} saved locally.": "Wallet saved locally: {accountId}.",
  "Wallet {accountId} restored locally.":
    "Wallet restored locally: {accountId}.",
  "Restore wallet": "Restore wallet",
  "UAID onboarding is unavailable on this Torii endpoint. The wallet was saved locally instead.":
    "UAID alias registration is unavailable here. Wallet saved locally.",
  Kaigi: "Kaigi",
  "Participant name": "Participant name",
  "Wallet identity": "Wallet identity",
  "Local media": "Local media",
  "Remote media": "Remote media",
  "Peer connection": "Peer connection",
  "ICE connection": "ICE connection",
  "ICE gathering": "ICE gathering",
  Signaling: "Signaling",
  "Remote participant": "Remote participant",
  "Waiting for the other wallet user.": "Waiting for the other wallet user.",
  "Call controls": "Call controls",
  Live: "Live",
  Idle: "Idle",
  "Preparing local media…": "Preparing media...",
  "Prepare local media": "Prepare local media",
  "Mute mic": "Mute mic",
  "Unmute mic": "Unmute mic",
  "Stop camera": "Stop camera",
  "Start camera": "Start camera",
  "Stop preview": "Stop preview",
  "Microphone on": "Mic on",
  "Microphone off": "Mic off",
  "Camera on": "Camera on",
  "Camera off": "Camera off",
  "Camera + microphone preview": "Camera + microphone preview",
  "Open local media before creating or answering a Kaigi call.":
    "Open local media before creating or answering.",
  "No remote media yet. The other user will appear here after the answer is applied and media starts flowing.":
    "No remote media yet. The other user appears here after the answer is applied.",
  "Create offer packet": "Create offer packet",
  "Create answer packet": "Create answer packet",
  "Applying remote answer…": "Applying remote answer...",
  "Apply answer packet": "Apply answer packet",
  "Copy packet": "Copy packet",
  "Paste from clipboard": "Paste from clipboard",
  "Clear packets": "Clear packets",
  "Hang up": "Hang up",
  "Outgoing packet": "Outgoing packet",
  "Remote packet": "Remote packet",
  "Ready to prepare a Kaigi call.": "Ready to prepare a Kaigi call.",
  "Enable at least audio or video before starting Kaigi.":
    "Enable at least audio or video before starting Kaigi.",
  "Kaigi media is unavailable in this environment.":
    "Kaigi media is unavailable here.",
  "Camera or microphone permission was denied.":
    "Camera or microphone permission was denied.",
  "No camera or microphone device is available.":
    "No camera or microphone device is available.",
  "Unable to start Kaigi media: {message}":
    "Could not start Kaigi media: {message}",
  "Local media is ready.": "Local media is ready.",
  "Kaigi packet is invalid.": "Kaigi packet is invalid.",
  "Signal packet kind must be {kind}.": "Signal packet kind must be {kind}.",
  "Signal packet room ID does not match this Kaigi room.":
    "Signal packet room ID does not match this room.",
  "Offer packet is missing session data.":
    "Offer packet is missing session data.",
  "Answer packet is missing session data.":
    "Answer packet is missing session data.",
  "Offer packet ready. Send it to the other wallet user.":
    "Offer packet ready. Send it to the other wallet user.",
  "Answer packet ready. Send it back to the caller.":
    "Answer packet ready. Send it back to the caller.",
  "Create offer packet first.": "Create offer packet first.",
  "Answer applied. The call can connect now.":
    "Answer applied. The call can connect now.",
  "This meeting has already ended.": "This meeting has already ended.",
  "Resumed active meeting link.": "Resumed active meeting link.",
  "Host wallet is unavailable for this invite.":
    "Host wallet is unavailable for this invite.",
  "Create a Kaigi packet first.": "Create a Kaigi packet first.",
  "Kaigi packet copied to clipboard.": "Kaigi packet copied to clipboard.",
  "Kaigi packet pasted from clipboard.": "Kaigi packet pasted from clipboard.",
  "Clipboard access failed. Copy the packet manually.":
    "Clipboard failed. Copy the packet manually.",
  "Clipboard access failed. Paste the packet manually.":
    "Clipboard failed. Paste the packet manually.",
  "Connected to {name}.": "Connected to {name}.",
  Guest: "Guest",
  Connected: "Connected",
  "Not connected": "Not connected",
  "Paste a Kaigi packet first.": "Paste a Kaigi packet first.",
  "Unable to create an offer.": "Could not create an offer.",
  "Unable to create an answer.": "Could not create an answer.",
  "Unable to apply the answer.": "Could not apply the answer.",
  "Failed to load governance state.": "Could not load governance state.",
  "Failed to refresh governance records.":
    "Could not refresh governance records.",
  "Failed to load staking state.": "Could not load staking state.",
  "Failed to load lane validators.": "Could not load lane validators.",
  "Transaction failed.": "Transaction failed.",
  "Action failed.": "Action failed.",
  "Local preview stopped.": "Local preview stopped.",
  SoraCloud: "SoraCloud",
  Healthy: "Healthy",
  Deploying: "Deploying",
  "Needs attention": "Needs attention",
  "Wallet ready": "Wallet ready",
  "Active wallet": "Active wallet",
  All: "All",
  Paused: "Paused",
  Failed: "Failed",
  Disabled: "Disabled",
  "Sora VPN": "Sora VPN",
  "Connect through the TAIRA privacy lane":
    "Connect through the TAIRA privacy lane",
  VPN: "VPN",
  "Connect, disconnect, and inspect Sora VPN sessions":
    "Connect, disconnect, and inspect Sora VPN sessions",
  "VPN Status": "VPN status",
  "VPN Helper": "VPN helper",
  Controller: "Controller",
  "Controller missing": "Controller missing",
  "Version pending": "Version pending",
  Unknown: "Unknown",
  "Connection state": "Connection state",
  "Session duration": "Session duration",
  "VPN Lease": "VPN lease",
  "System tunnel": "System tunnel",
  "Reconcile state": "Reconcile state",
  Steady: "Steady",
  "Tunnel interface": "Tunnel interface",
  "Primary network service": "Primary network service",
  "Exit class": "Exit class",
  "VPN ready": "VPN ready",
  "VPN unavailable": "VPN unavailable",
  "VPN helper is ready.": "VPN helper is ready.",
  "System tunnel is ready.": "System tunnel is ready.",
  "System tunnel is active.": "System tunnel is active.",
  "System tunnel active": "System tunnel active",
  "System tunnel inactive": "System tunnel inactive",
  "Not configured": "Not configured",
  "Not required": "Not required",
  "Set SORANET_VPN_INTERFACE to an existing tunnel interface before connecting VPN.":
    "Set SORANET_VPN_INTERFACE to an existing tunnel interface before connecting VPN.",
  "Set SORANET_VPN_NETWORK_SERVICE or connect to a primary network service so DNS can be managed.":
    "Set SORANET_VPN_NETWORK_SERVICE or connect to a primary network service so DNS can be managed.",
  "Unable to verify the configured VPN tunnel interface.":
    "Unable to verify the configured VPN tunnel interface.",
  "Real system tunnel management currently supports macOS and Linux only.":
    "Real system tunnel management currently supports macOS and Linux only.",
  "Checking VPN helper…": "Checking VPN helper...",
  "Relay endpoint pending.": "Relay endpoint pending.",
  "Billing label pending.": "Billing label pending.",
  "Lease pending.": "Lease pending.",
  "VPN connecting": "Connecting",
  "VPN connected": "Connected",
  "VPN disconnecting": "Disconnecting",
  "VPN reconciling": "Reconciling",
  "VPN remote lease expiry pending": "Remote lease expiry pending",
  "VPN repair required": "Repair required",
  "VPN error": "Error",
  "VPN idle": "Idle",
  "Low latency": "Low latency",
  "High security": "High security",
  Standard: "Standard",
  "Repair VPN": "Repair VPN",
  "Connect VPN": "Connect VPN",
  "Disconnect VPN": "Disconnect VPN",
  "Disconnecting…": "Disconnecting...",
  "Connecting…": "Connecting...",
  "Repairing…": "Repairing...",
  "Session Details": "Session details",
  "Session ID": "Session ID",
  "Relay endpoint": "Relay endpoint",
  "Connected at": "Connected at",
  "Expires at": "Expires at",
  "Traffic in": "Traffic in",
  "Traffic out": "Traffic out",
  "VPN Profile": "VPN profile",
  "Server-pushed routes": "Server-pushed routes",
  "No pushed routes configured.": "No pushed routes configured.",
  "DNS servers": "DNS servers",
  "No DNS servers configured.": "No DNS servers configured.",
  "Excluded routes": "Excluded routes",
  "No excluded routes configured.": "No excluded routes configured.",
  "Tunnel addresses": "Tunnel addresses",
  "No tunnel addresses configured.": "No tunnel addresses configured.",
  "Tunnel MTU": "Tunnel MTU",
  "Recent VPN receipts": "Recent VPN receipts",
  Duration: "Duration",
  Traffic: "Traffic",
  "No VPN receipts yet.": "No VPN receipts yet.",
  "Failed to load VPN state.": "Failed to load VPN state.",
  "Failed to connect VPN.": "Failed to connect VPN.",
  "Failed to disconnect VPN.": "Failed to disconnect VPN.",
  "Failed to repair VPN.": "Failed to repair VPN.",
  "VPN control plane is unavailable on this Torii node.":
    "VPN control plane is unavailable on this Torii node.",
  "No VPN session yet.": "No VPN session yet.",
  "0s": "0s",
  "Share a Kaigi meeting link, then connect browser audio and video between two wallet users.":
    "Share a meeting link, then connect browser audio and video between two wallet users.",
  "Start meeting": "Start meeting",
  "Join meeting": "Join meeting",
  "Meeting title": "Meeting title",
  Hidden: "Hidden",
  Optional: "Optional",
  "Scheduled start": "Scheduled start",
  "Start now": "Start now",
  "Meeting invite": "Meeting invite",
  "Meeting link ready": "Meeting link ready",
  "Host prompt": "Host prompt",
  "Host checklist": "Host checklist",
  "Meeting code": "Meeting code",
  "Invite link": "Invite link",
  "Copy invite link": "Copy invite link",
  "Meeting invite copied to clipboard.": "Meeting invite copied to clipboard.",
  "Fallback route": "Fallback route",
  "Copy fallback route": "Copy fallback route",
  "Fallback route copied to clipboard.": "Fallback route copied to clipboard.",
  "Meeting summary": "Meeting summary",
  "This meeting invite has expired.": "This meeting invite has expired.",
  "Open local media, then join the loaded meeting.":
    "Open local media, then join the loaded meeting.",
  Host: "Host",
  "Host wallet": "Host wallet",
  Expires: "Expires",
  "Untitled meeting": "Untitled meeting",
  "Join path": "Join path",
  Waiting: "Waiting",
  "Creating meeting link…": "Creating meeting link…",
  "Create meeting link": "Create meeting link",
  "Joining meeting…": "Joining meeting…",
  "Load invite": "Load invite",
  "Advanced signaling": "Advanced signaling",
  "Show raw packets": "Show raw packets",
  "Create manual answer packet": "Create manual answer packet",
  "Creating manual answer…": "Creating manual answer…",
  "Open local media before creating or joining a Kaigi meeting.":
    "Open local media before creating or joining a Kaigi meeting.",
  "Create a meeting link to invite another wallet user.":
    "Create a meeting link to invite another wallet user.",
  "Automatic join": "Automatic join",
  "Manual fallback": "Manual fallback",
  "Nothing to copy yet.": "Nothing to copy yet.",
  "Packet buffers cleared.": "Packet buffers cleared.",
  "Scheduled start is invalid.": "Scheduled start is invalid.",
  "Meeting invite loaded. Join when your media is ready.":
    "Meeting invite loaded. Join when your media is ready.",
  "Meeting invite link is invalid.": "Meeting invite link is invalid.",
  "Paste or open a meeting invite to join.":
    "Paste or open a meeting invite to join.",
  "Save a wallet before using Kaigi.": "Save a wallet before using Kaigi.",
  "Unable to create a live Kaigi meeting.":
    "Unable to create a live Kaigi meeting.",
  "Meeting link ready. Share it with the other participant.":
    "Meeting link ready. Share it with the other participant.",
  "Unable to create a Kaigi meeting link.":
    "Unable to create a Kaigi meeting link.",
  "Load a meeting invite first.": "Load a meeting invite first.",
  "Joined the meeting. Your encrypted answer was posted on-chain for the host to apply automatically.":
    "Joined the meeting. Your encrypted answer was posted on-chain for the host to apply automatically.",
  "Unable to join the live Kaigi meeting.":
    "Unable to join the live Kaigi meeting.",
  "Participant answer ready": "Participant answer ready",
  "The guest answer packet is ready. Apply it now so audio and video can start.":
    "The guest answer packet is ready. Apply it now so audio and video can start.",
  "I will keep this window open": "I will keep this window open",
  Later: "Later",
  "Manual answer packet ready. Send it to the host.":
    "Manual answer packet ready. Send it to the host.",
  "Participant answer detected and applied automatically.":
    "Participant answer detected and applied automatically.",
  "Meeting invite pasted from clipboard.":
    "Meeting invite pasted from clipboard.",
  "Create a meeting link first.": "Create a meeting link first.",
  "Meeting ended.": "Meeting ended.",
  "Unable to publish the meeting end signal: {message}":
    "Unable to publish the meeting end signal: {message}",
  "Unknown Kaigi end error": "Unknown Kaigi end error",
  "Action in progress.": "Action in progress.",
  Actions: "Actions",
  "Active challenges": "Active challenges",
  "Active proposal": "Active proposal",
  "Bond citizenship": "Bond citizenship",
  "Bonding is unavailable.": "Bonding is unavailable.",
  "Challenge bond": "Challenge bond",
  "Challenge window": "Challenge window",
  Endpoint: "Endpoint",
  "Expert briefs": "Expert briefs",
  "Fallback lifecycle": "Fallback lifecycle",
  Lifecycle: "Lifecycle",
  "Lifecycle endpoint": "Lifecycle endpoint",
  "Next action": "Next action",
  "No governance record loaded": "No governance record loaded",
  "Proposal loaded": "Proposal loaded",
  "Ready for governance actions.": "Ready for governance actions.",
  "Red-team briefs": "Red-team briefs",
  Role: "Role",
  Rollout: "Rollout",
  "Select a stage to inspect only the relevant evidence.":
    "Select a stage to inspect only the relevant evidence.",
  "Selected stage": "Selected stage",
  Selection: "Selection",
  Stage: "Stage",
  Summary: "Summary",
  Unavailable: "Unavailable",
  "Full adversarial lifecycle data is not available on this endpoint yet.":
    "Full adversarial lifecycle data is not available on this endpoint yet.",
  Submitted: "Submitted",
  Briefs: "Briefs",
  Comment: "Comment",
  Sortition: "Sortition",
  Tally: "Tally",
  Challenge: "Challenge",
  Canary: "Canary",
  Review: "Review",
  complete: "complete",
  active: "active",
  pending: "pending",
  unavailable: "unavailable",
  blocked: "blocked",
  open: "open",
  closed: "closed",
  "Expert and red-team brief endpoints are not available on this Torii endpoint yet.":
    "Expert and red-team brief endpoints are not available on this Torii endpoint yet.",
  "Public comment endpoints are not available on this Torii endpoint yet.":
    "Public comment endpoints are not available on this Torii endpoint yet.",
  "Council data shows the active Parliament roster when Torii exposes it.":
    "Council data shows the active Parliament roster when Torii exposes it.",
  "Challenge-window endpoints are not available on this Torii endpoint yet.":
    "Challenge-window endpoints are not available on this Torii endpoint yet.",
  "Canary rollout endpoints are not available on this Torii endpoint yet.":
    "Canary rollout endpoints are not available on this Torii endpoint yet.",
  "Retrospective review and clawback endpoints are not available on this Torii endpoint yet.":
    "Retrospective review and clawback endpoints are not available on this Torii endpoint yet.",
  Operator: "Operator",
  "Seated member": "Seated member",
  Alternate: "Alternate",
  Citizen: "Citizen",
  "No governance role": "No governance role",
};
const EN_TRANSLATIONS: TranslationTable = {
  IH58: "I105",
  I105: "I105",
  "Iroha Points": "MINAMOTO Mainnet",
  "Modern Torii-connected wallet": "Mainnet Torii wallet",
  Navigate: "Menu",
  Settings: "Settings",
  "Endpoint and app preferences": "Endpoint and app preferences",
  "Torii endpoint": "Torii endpoint",
  "Default endpoint": "Default endpoint",
  "Custom endpoint": "Custom endpoint",
  "Asset not set": "No asset",
  "Switch to light": "Light mode",
  "Switch to dark": "Dark mode",
  "Account ready": "Wallet ready",
  "Account saved": "Wallet saved",
  "Complete onboarding": "Finish setup",
  "Onboarding required": "Setup required",
  "Complete account setup first": "Create a wallet first.",
  "TAIRA Torii ready": "Network ready",
  "Torii unavailable": "Network unavailable",
  "TAIRA locked": "Network selected",
  "Open Taira Explorer": "Open explorer",
  "Explorer Metrics": "Network metrics",
  "Metrics unavailable. Check Torii status.":
    "Metrics unavailable. Check the network.",
  "Account Setup": "Create Wallet",
  Session: "Advanced",
  Parliament: "Governance",
  Explorer: "Explore",
  "Create and save your TAIRA wallet": "Create wallet",
  "Generate keys, recovery phrase, Connect pairing":
    "Create wallet and pair Connect",
  "Balances, assets, and latest transactions": "Balances and activity",
  "Transfer assets with camera or QR upload": "Send with QR",
  "Share QR or IH58": "Show QR or Account ID",
  "Share QR or Account ID": "Show QR or Account ID",
  "Share QR codes or IH58 to request funds": "Show QR to get paid",
  "Share QR codes or account IDs to request funds": "Show QR to get paid",
  "Auto-deduct and manage recurring services": "Manage recurring payments",
  "Nominate validators and stake XOR for NPOS": "Stake XOR",
  "Network metrics and asset explorer": "Network and assets",
  "TAIRA connection, asset, and authority keys":
    "Advanced network and authority tools",
  "Wallet Overview": "Wallet",
  "Balances & activity": "Balances and activity",
  "NPOS Staking": "Stake",
  "SORA Parliament": "Governance",
  "Subscription Hub": "Subscriptions",
  "Auto-deduct and manage services": "Recurring payments",
  "Send Points": "Send",
  "Transfer assets via Torii": "Send funds",
  "Receive Points": "Receive",
  "Network & asset insights": "Network and assets",
  "Session Setup": "Advanced",
  "TAIRA connection & keys": "Network and keys",
  "TAIRA Testnet Account": "Create wallet",
  "Generate your account keys, store a recovery phrase, and save the wallet locally. Torii registration is optional.":
    "Create keys, back up your phrase, and save the wallet. Registration is optional.",
  "Generate your account keys, store a recovery phrase, and save the wallet locally. On-chain alias registration is optional.":
    "Create keys, back up your phrase, and save the wallet. Alias is optional.",
  "Restore your wallet from a recovery phrase and save it locally.":
    "Restore a wallet from your phrase and save it locally.",
  "Display Name (local only, not on-chain)": "Wallet name",
  "Canonical I105 Account ID": "I105 Account ID",
  "Generate recovery phrase": "Create recovery phrase",
  "Restore from recovery phrase": "Restore from phrase",
  "Paste a 12- or 24-word recovery phrase to derive the same wallet keys locally.":
    "Paste a 12- or 24-word phrase to derive this wallet locally.",
  "TAIRA testnet connection is fixed in this build.": "Network managed.",
  "TAIRA testnet connection is fixed for onboarding in this build.":
    "Network managed.",
  "Public TAIRA testnet profile.": "Public testnet.",
  "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not a TAIRA dataspace alias.":
    "{domain} is local only.",
  "Create recovery phrase": "Create recovery phrase",
  "Hide restore": "Hide restore",
  "Recovery Phrase": "Recovery phrase",
  "Load recovery phrase": "Load phrase",
  "Import backup JSON": "Import backup JSON",
  "Restoring…": "Restoring…",
  "Download backup": "Back up phrase",
  "Copy phrase": "Copy phrase",
  "Recovery phrase copied to clipboard.":
    "Recovery phrase copied to clipboard.",
  "Clipboard access failed. Copy the phrase manually.":
    "Clipboard failed. Copy the phrase manually.",
  "Write these words down in order. They restore your wallet.":
    "Back these words up. They restore this wallet.",
  "I stored my recovery phrase safely.": "I backed up my phrase.",
  "Enter a recovery phrase.": "Enter a recovery phrase.",
  "Recovery phrase must contain 12 or 24 words.":
    "Recovery phrase must contain 12 or 24 words.",
  "Invalid recovery phrase": "Invalid recovery phrase",
  "Invalid backup file.": "Invalid backup file.",
  "Backup file is missing a recovery phrase.":
    "Backup file is missing a recovery phrase.",
  "Recovery phrase confirmed": "Phrase confirmed",
  "Save identity": "Save wallet",
  "Restore wallet": "Restore wallet",
  "Create on-chain account": "Authority-only registration",
  "Optional on-chain alias registration": "Optional alias",
  "This submits the UAID alias registration flow when the endpoint supports it. Your wallet already works without this step.":
    "Register an alias if you want one. The wallet works without it.",
  "Alias Metadata (JSON, optional)": "Alias metadata",
  "Register on-chain alias": "Register alias",
  "Registering alias…": "Registering...",
  "On-chain alias {accountId} queued (tx {txHash}…)":
    "Alias queued: {accountId} ({txHash}...)",
  "On-chain alias registration is unavailable on this Torii endpoint. The wallet was saved locally instead.":
    "Alias registration is unavailable here. Wallet saved locally.",
  "On-chain alias registration is unavailable on this Torii endpoint. The wallet was still saved locally.":
    "Alias registration is unavailable here. Wallet saved locally.",
  "Saved Wallets": "Wallets",
  "Switch between saved wallets or begin a fresh wallet setup.":
    "Switch wallets or create one.",
  "No saved wallets yet. Complete the wallet setup form to add one.":
    "No saved wallets yet.",
  "Add another wallet": "Add wallet",
  "Register another": "New wallet",
  "Start registration": "Create wallet",
  "Active account": "Active wallet",
  "Select account": "Select wallet",
  "Switch between saved accounts without re-entering keys.":
    "Switch wallets without re-entering keys.",
  "No saved accounts yet. Start the registration flow to add one.":
    "No saved wallets yet.",
  "Not selected": "No wallet selected",
  "Recovery phrase saved": "Phrase backed up",
  "Account {accountId} saved locally.": "Wallet saved locally: {accountId}.",
  "Wallet {accountId} restored locally.":
    "Wallet restored locally: {accountId}.",
  "Secure OS-backed key storage is unavailable on this device.":
    "Secure OS-backed key storage is unavailable on this device.",
  "UAID onboarding is unavailable on this Torii endpoint. The wallet was saved locally instead.":
    "UAID alias registration is unavailable here. Wallet saved locally.",
  "Confirm that you stored the recovery phrase.": "Confirm you backed it up.",
  "Generate a keypair first.": "Create keys first.",
  "Identity metadata must be a JSON object.": "Metadata must be a JSON object.",
  "Invalid identity metadata JSON payload.": "Invalid metadata JSON.",
  Unnamed: "Wallet",
  "Already using IrohaConnect on your phone? Generate a pairing session to approve desktop access without exporting keys. Signing stays on the phone; this app watches balances.":
    "Pair from your phone. Keys stay there.",
  IrohaConnect: "IrohaConnect",
  "IrohaConnect Pairing": "Connect pairing",
  "Scan a visible IrohaConnect QR from another app window, or upload a saved QR image.":
    "Scan a visible Connect QR or upload an image.",
  "Scan screen QR": "Scan screen QR",
  "Scanning screen...": "Scanning screen...",
  "Screen capture is not supported in this environment.":
    "Screen capture is not supported here.",
  "Choose the screen or window that contains the QR code.":
    "Choose the screen or window with the QR code.",
  "Unable to capture a screen frame.": "Could not capture the screen.",
  "No QR code found on the selected screen.":
    "No QR found on the selected screen.",
  "Screen QR scan cancelled.": "Screen scan cancelled.",
  "Unable to read QR from screen.": "Could not read QR from the screen.",
  Approval: "Approval",
  "Approving...": "Approving...",
  "Approving…": "Approving...",
  Ready: "Ready",
  "IrohaConnect approved.": "IrohaConnect approved.",
  "Generate pairing QR": "Show pairing QR",
  "TAIRA connection is unavailable. Reload and try again.":
    "TAIRA connection unavailable. Reload and try again.",
  "Torii Connection": "Network",
  "Check health": "Test connection",
  "Key Material": "Keys",
  "Private Key (hex)": "Private key (hex)",
  "Public Key": "Public key",
  "Generate pair": "Generate keys",
  "Derive from private key": "Derive public key",
  "Register Account": "Authority-only registration",
  "Register account": "Authority-only registration",
  "Requires authority credentials to create the account on-chain.":
    "Advanced tool. Requires authority credentials. Regular wallets are created from Create Wallet.",
  "Requires authority credentials — Torii receives a direct Norito transaction.":
    "Advanced tool. Requires authority credentials. Regular wallets are created from Create Wallet.",
  "Authority Account ID": "Authority account",
  "Authority Private Key (hex)": "Authority key (hex)",
  "Account Metadata (JSON)": "Metadata",
  Healthy: "Ready",
  Idle: "Not checked",
  "Torii responded successfully.": "Connection OK.",
  "No response from Torii.": "No response.",
  "Submitted transaction {hash}": "Submitted: {hash}",
  "Faucet Request": "Network faucet",
  "Claim 25,000 TAIRA testnet XOR for governance and testing.":
    "Request starter XOR from the active network faucet.",
  "Top up a new TAIRA account once with starter XOR.":
    "Claim 25,000 XOR for governance and testing.",
  "Claim Testnet XOR": "Request XOR",
  "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or registered.":
    "This wallet is local only. Balances stay empty until it is funded or otherwise created on-chain.",
  "No assets found for this account.": "No assets yet.",
  "Latest Transactions": "Recent activity",
  "No transfers recorded yet.": "No activity yet.",
  "Faucet request in progress": "Requesting XOR",
  "Requesting faucet puzzle…": "Loading faucet challenge...",
  "Waiting for finalized faucet seed data…": "Waiting for faucet seed...",
  "Solving faucet proof-of-work…": "Solving faucet proof...",
  "Submitting faucet claim…": "Submitting claim...",
  "Retrying faucet claim after queue expiry…": "Retrying after queue expiry...",
  "Faucet claim accepted. Updating wallet…":
    "Claim accepted. Updating wallet...",
  "Faucet claim accepted. Waiting for finality…":
    "Claim accepted. Waiting for finality...",
  "Waiting for faucet transaction finality…": "Waiting for finality...",
  "Faucet transaction committed. Updating wallet…":
    "Claim finalized. Updating wallet...",
  "Refreshing wallet balance…": "Refreshing wallet...",
  "Your TAIRA faucet request is in flight. This can take a few seconds.":
    "This can take a few seconds.",
  "TAIRA dropped the previous queued faucet claim before commit. Retrying automatically with backoff.":
    "The last queued faucet claim expired. Retrying automatically.",
  "Waiting for TAIRA to expose the funded asset in account balances.":
    "Waiting for balances to index.",
  "Testnet XOR requested: {hash}": "XOR finalized on-chain: {hash}",
  "Faucet accepted, but wallet balances are still indexing. Refresh again in a few seconds.":
    "Claim finalized. Balances are still indexing. Refresh in a few seconds.",
  "Failed to request faucet funds.": "Faucet request failed.",
  "Wallet data is unavailable until this account exists on-chain.":
    "No on-chain wallet data yet.",
  "Configure account first": "Create wallet first",
  "Configure an account before generating QR codes.":
    "Create a wallet before showing a QR.",
  "Generating QR...": "Generating QR...",
  "Failed to render QR.": "Could not render QR.",
  "Memo (optional)": "Note",
  "QR decoded successfully.": "QR loaded.",
  "Configure Torii + account first.": "Set up network and wallet first.",
  "Transaction finalized on-chain: {hash}":
    "Transaction finalized on-chain: {hash}",
  "Citizenship Bond": "Citizenship",
  "Granted permissions: {permissions}": "Permissions: {permissions}",
  "Available XOR balance is below the required citizen bond amount.":
    "Not enough XOR for the bond.",
  "Proposal ID must be 32-byte hex (with or without 0x prefix).":
    "Proposal ID must be 32-byte hex.",
  "Proposal found: {value}.": "Proposal found: {value}",
  "Lock Records": "Locks",
  "Lock duration (blocks)": "Lock (blocks)",
  "Council & Draft Ops": "Council and drafts",
  "Loaded {count} permission token(s).": "Loaded {count} permissions.",
  "Governance records refreshed. Invalid proposal ID was ignored.":
    "Governance refreshed. Invalid proposal ID ignored.",
  "Governance records refreshed.": "Governance refreshed.",
  "Set up network and wallet first.": "Set up network and wallet first.",
  "Configure Torii and complete account onboarding first.":
    "Set up network and wallet first.",
  "A minimum of {amount} XOR is required to register citizenship.":
    "You need at least {amount} XOR to register citizenship.",
  "Connection, chain, and active account are required.":
    "Network, chain, and wallet are required.",
  enabled: "ready",
  "Nominate Validators": "Stake",
  "Stake XOR by dataspace. Lane selection is automatic from live governance, then validators are loaded for that lane.":
    "Pick a dataspace and validator. The lane is resolved automatically.",
  "Stake Token Balance": "Stake balance",
  "Validator total stake {total} XOR, self stake {self} XOR, status {status}.":
    "Total {total} XOR, self {self} XOR, {status}.",
  "Bond / Unbond": "Stake / Unstake",
  "Bond amount": "Stake amount",
  "Bond amount (XOR)": "Stake amount",
  "Bond XOR": "Stake",
  "Pending Unbonds": "Pending unstakes",
  "Unbond Delay": "Unstake delay",
  "Unbond amount": "Unstake amount",
  "Unbond amount (XOR)": "Unstake amount",
  "Schedule Unbond": "Unstake",
  "Finalize Unbond": "Finalize unstake",
  "Release is set from on-chain policy: {datetime}.": "Release: {datetime}.",
  "Your Position": "Your stake",
  "Finalize request": "Pending request",
  "No pending unbond requests for the selected validator.":
    "No pending unstakes.",
  "No pending rewards for this lane/account.": "No pending rewards.",
  "Loaded {count} dataspace option(s).": "Loaded {count} dataspaces.",
  "No dataspace governance found on this Torii endpoint.":
    "No staking data found on this endpoint.",
  "Failed to load governance state.": "Could not load governance state.",
  "Failed to refresh governance records.":
    "Could not refresh governance records.",
  "Failed to load staking state.": "Could not load staking state.",
  "Failed to load lane validators.": "Could not load lane validators.",
  "Transaction failed.": "Transaction failed.",
  "Action failed.": "Action failed.",
  "Connection, account, dataspace, and validator are required.":
    "Network, wallet, dataspace, and validator are required.",
  "No {symbol} balance available to bond.": "No {symbol} available to stake.",
  "Bond submitted: {hash}": "Stake submitted: {hash}",
  "Connection, account, validator, and staking policy are required.":
    "Network, wallet, validator, and policy are required.",
  "No bonded stake available to unbond.": "No stake available to unstake.",
  "bonded stake": "staked amount",
  "Unbond scheduled ({requestId}) for {datetime}. Tx: {hash}":
    "Unstake scheduled ({requestId}) for {datetime}. Tx: {hash}",
  "Reward claim submitted: {hash}": "Rewards claimed: {hash}",
  "Auto-deduct runs on due dates. Usage-based subscriptions can fluctuate each billing cycle.":
    "Auto-pay runs on due dates. Usage-based charges can vary.",
  "Auto-deduct on": "Auto-pay on",
  "Leave amount blank and set a max for usage-based billing. Auto-deduct runs automatically.":
    "Leave amount blank and set a max for usage-based billing.",
  "Add subscription": "New subscription",
  "All subscriptions": "Subscriptions",
  "Service name": "Merchant",
  "Max for usage-based ({unit})": "Usage cap ({unit})",
  "Canceling at period end": "Ends at period end",
  "No subscriptions yet.": "No subscriptions.",
  "Next auto-deduct": "Next charge",
  "Send to online wallet": "Send to wallet",
  "Enter an amount to move online.": "Enter an amount.",
  "Rendered straight from Torii so wallets can scan the exact payload.":
    "Rendered directly from Torii.",
  "No QR payload yet. Connect to Torii and choose an account.":
    "No QR yet. Connect to Torii and choose a wallet.",
  "No QR payload yet. Connect to Torii and pick an account.":
    "No QR yet. Connect to Torii and choose a wallet.",
  "Camera access is not supported on this device.":
    "Camera access is unavailable on this device.",
  "Camera preview is not ready.": "Camera is not ready.",
  "Unable to decode the selected image.": "Could not read the selected image.",
  "Unable to read QR from image.": "Could not read the QR from the image.",
  "Unable to start scanner.": "Could not start the scanner.",
  Kaigi: "Kaigi",
  "Participant name": "Participant name",
  "Wallet identity": "Wallet identity",
  "Peer connection": "Peer connection",
  "ICE connection": "ICE connection",
  "ICE gathering": "ICE gathering",
  Signaling: "Signaling",
  "Remote participant": "Remote participant",
  "Waiting for the other wallet user.": "Waiting for the other wallet user.",
  "Call controls": "Call controls",
  "Preparing local media…": "Preparing media...",
  "Prepare local media": "Prepare local media",
  "Mute mic": "Mute mic",
  "Unmute mic": "Unmute mic",
  "Stop camera": "Stop camera",
  "Start camera": "Start camera",
  "Stop preview": "Stop preview",
  "Microphone on": "Mic on",
  "Microphone off": "Mic off",
  "Camera on": "Camera on",
  "Camera off": "Camera off",
  "Camera + microphone preview": "Camera + microphone preview",
  "Open local media before creating or answering a Kaigi call.":
    "Open local media before creating or answering.",
  "No remote media yet. The other user will appear here after the answer is applied and media starts flowing.":
    "No remote media yet. The other user appears here after the answer is applied.",
  "Create offer packet": "Create offer packet",
  "Create answer packet": "Create answer packet",
  "Applying remote answer…": "Applying remote answer...",
  "Apply answer packet": "Apply answer packet",
  "Copy packet": "Copy packet",
  "Paste from clipboard": "Paste from clipboard",
  "Clear packets": "Clear packets",
  "Hang up": "Hang up",
  "Outgoing packet": "Outgoing packet",
  "Remote packet": "Remote packet",
  "Ready to prepare a Kaigi call.": "Ready to prepare a Kaigi call.",
  "Enable at least audio or video before starting Kaigi.":
    "Enable at least audio or video before starting Kaigi.",
  "Kaigi media is unavailable in this environment.":
    "Kaigi media is unavailable here.",
  "Camera or microphone permission was denied.":
    "Camera or microphone permission was denied.",
  "No camera or microphone device is available.":
    "No camera or microphone device is available.",
  "Unable to start Kaigi media: {message}":
    "Could not start Kaigi media: {message}",
  "Local media is ready.": "Local media is ready.",
  "Kaigi packet is invalid.": "Kaigi packet is invalid.",
  "Signal packet kind must be {kind}.": "Signal packet kind must be {kind}.",
  "Signal packet room ID does not match this Kaigi room.":
    "Signal packet room ID does not match this room.",
  "Offer packet is missing session data.":
    "Offer packet is missing session data.",
  "Answer packet is missing session data.":
    "Answer packet is missing session data.",
  "Offer packet ready. Send it to the other wallet user.":
    "Offer packet ready. Send it to the other wallet user.",
  "Answer packet ready. Send it back to the caller.":
    "Answer packet ready. Send it back to the caller.",
  "Create offer packet first.": "Create offer packet first.",
  "Answer applied. The call can connect now.":
    "Answer applied. The call can connect now.",
  "Create a Kaigi packet first.": "Create a Kaigi packet first.",
  "Kaigi packet copied to clipboard.": "Kaigi packet copied to clipboard.",
  "Kaigi packet pasted from clipboard.": "Kaigi packet pasted from clipboard.",
  "Clipboard access failed. Copy the packet manually.":
    "Clipboard failed. Copy the packet manually.",
  "Clipboard access failed. Paste the packet manually.":
    "Clipboard failed. Paste the packet manually.",
  "Connected to {name}.": "Connected to {name}.",
  Guest: "Guest",
  Connected: "Connected",
  "Not connected": "Not connected",
  "Paste a Kaigi packet first.": "Paste a Kaigi packet first.",
  "Unable to create an offer.": "Could not create an offer.",
  "Unable to create an answer.": "Could not create an answer.",
  "Unable to apply the answer.": "Could not apply the answer.",
  "Unable to reach Torii.": "Could not reach Torii.",
  "Failed to create the on-chain account.":
    "Could not create the on-chain account.",
  "Failed to save the authority account.":
    "Could not save the authority account.",
  "Local preview stopped.": "Local preview stopped.",
  "Building…": "Creating...",
  "Recording…": "Saving...",
  "Transferring…": "Sending...",
  "Edit raw asset ID": "Edit raw asset ID",
  "Raw asset ID": "Raw asset ID",
  "Storage base fee": "Storage base fee",
  "Actual storage charge": "Actual storage charge",
  "Maximum compute reservation charge": "Maximum compute reservation charge",
  "Actual compute reservation charge": "Actual compute reservation charge",
  "Transaction committed — settlement indexing":
    "Transaction finalized — settlement indexing",
  "Transaction finalized — settlement indexing":
    "Transaction finalized — settlement indexing",
  "Pending indexing": "Pending indexing",
};

const HISTORICAL_KEY_SOURCE_TABLES: TranslationTable[] = [
  SHARED_ENGLISH_FALLBACK_TRANSLATIONS,
  EN_TRANSLATIONS,
  EGYPTIAN_TRANSLATIONS,
  OLD_AKKADIAN_TRANSLATIONS,
  AR_TRANSLATIONS,
  AZ_TRANSLATIONS,
  CA_TRANSLATIONS,
  CS_TRANSLATIONS,
  DE_TRANSLATIONS,
  ES_TRANSLATIONS,
  FA_TRANSLATIONS,
  FI_TRANSLATIONS,
  FR_TRANSLATIONS,
  HE_TRANSLATIONS,
  HI_TRANSLATIONS,
  HU_TRANSLATIONS,
  ID_TRANSLATIONS,
  IT_TRANSLATIONS,
  JA_TRANSLATIONS,
  KO_TRANSLATIONS,
  MS_TRANSLATIONS,
  NB_TRANSLATIONS,
  NL_TRANSLATIONS,
  PL_TRANSLATIONS,
  PT_TRANSLATIONS,
  RU_TRANSLATIONS,
  SL_TRANSLATIONS,
  SR_TRANSLATIONS,
  TR_TRANSLATIONS,
  UK_TRANSLATIONS,
  UR_TRANSLATIONS,
  VI_TRANSLATIONS,
  ZH_TRANSLATIONS,
  ZH_TW_TRANSLATIONS,
  ...Object.values(QUIET_SAKURA_TRANSLATIONS),
];

const HISTORICAL_ENGLISH_SOURCE: TranslationTable = Object.fromEntries(
  [
    ...new Set(
      HISTORICAL_KEY_SOURCE_TABLES.flatMap((table) => Object.keys(table)),
    ),
  ].map((key) => [
    key,
    EN_TRANSLATIONS[key] ?? SHARED_ENGLISH_FALLBACK_TRANSLATIONS[key] ?? key,
  ]),
);

/** Every key materialized for the historical locales, exported for coverage. */
export const HISTORICAL_UI_TRANSLATION_KEYS = Object.freeze(
  Object.keys(HISTORICAL_ENGLISH_SOURCE),
);

const EGYPTIAN_FULL_TRANSLATIONS = buildHistoricalTranslationTable(
  "egy-Egyp",
  HISTORICAL_ENGLISH_SOURCE,
  EGYPTIAN_TRANSLATIONS,
);
const OLD_AKKADIAN_FULL_TRANSLATIONS = buildHistoricalTranslationTable(
  "akk-Xsux",
  HISTORICAL_ENGLISH_SOURCE,
  OLD_AKKADIAN_TRANSLATIONS,
);

const BASE_TABLES: Record<SupportedLocale, TranslationTable> = {
  "en-US": EN_TRANSLATIONS,
  "ar-SA": AR_TRANSLATIONS,
  "az-AZ": AZ_TRANSLATIONS,
  "ca-ES": CA_TRANSLATIONS,
  "cs-CZ": CS_TRANSLATIONS,
  "de-DE": DE_TRANSLATIONS,
  "egy-Egyp": EGYPTIAN_FULL_TRANSLATIONS,
  "es-ES": ES_TRANSLATIONS,
  "fa-IR": FA_TRANSLATIONS,
  "fi-FI": FI_TRANSLATIONS,
  "fr-FR": FR_TRANSLATIONS,
  "he-IL": HE_TRANSLATIONS,
  "hi-IN": HI_TRANSLATIONS,
  "hu-HU": HU_TRANSLATIONS,
  "id-ID": ID_TRANSLATIONS,
  "it-IT": IT_TRANSLATIONS,
  "ja-JP": JA_TRANSLATIONS,
  "akk-Xsux": OLD_AKKADIAN_FULL_TRANSLATIONS,
  "ko-KR": KO_TRANSLATIONS,
  "ms-MY": MS_TRANSLATIONS,
  "nb-NO": NB_TRANSLATIONS,
  "nl-NL": NL_TRANSLATIONS,
  "pl-PL": PL_TRANSLATIONS,
  "pt-PT": PT_TRANSLATIONS,
  "ru-RU": RU_TRANSLATIONS,
  "sr-RS": SR_TRANSLATIONS,
  "sl-SI": SL_TRANSLATIONS,
  "tr-TR": TR_TRANSLATIONS,
  "uk-UA": UK_TRANSLATIONS,
  "ur-PK": UR_TRANSLATIONS,
  "vi-VN": VI_TRANSLATIONS,
  "zh-CN": ZH_TRANSLATIONS,
  "zh-TW": ZH_TW_TRANSLATIONS,
};

const TABLES = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [
    locale,
    {
      ...(locale === "en-US" ? {} : SHARED_ENGLISH_FALLBACK_TRANSLATIONS),
      ...BASE_TABLES[locale],
      ...(locale === "en-US" ? {} : QUIET_SAKURA_TRANSLATIONS[locale]),
    },
  ]),
) as Record<SupportedLocale, TranslationTable>;

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

const HISTORICAL_LOCALES = new Set<SupportedLocale>(["egy-Egyp", "akk-Xsux"]);

const LEGACY_TERM_REPLACEMENTS: Array<[from: string, to: string]> = [
  ["IH58", "I105"],
  ["ih58", "I105"],
  ["ИХ58", "I105"],
  ["आईएच58", "I105"],
];

const TRANSLATION_KEY_ALIASES: Record<string, string> = {
  I105: "IH58",
  "Share QR or Account ID": "Share QR or IH58",
  "Share QR codes or account IDs to request funds":
    "Share QR codes or IH58 to request funds",
};

const LITERAL_KEY_OVERRIDES: Record<string, string> = {
  "Iroha Wallet": "Iroha Wallet",
  IH58: "I105",
  I105: "I105",
};

export const isSupportedLocale = (value: string): value is SupportedLocale =>
  SUPPORTED_LOCALES.includes(value as SupportedLocale);

export const detectPreferredLocale = (): SupportedLocale => {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }
  const candidates = [
    navigator.language,
    ...(navigator.languages ?? []),
  ].filter(Boolean);
  const languageFallbacks: Array<[prefix: string, locale: SupportedLocale]> = [
    ["ar", "ar-SA"],
    ["az", "az-AZ"],
    ["ca", "ca-ES"],
    ["cs", "cs-CZ"],
    ["de", "de-DE"],
    ["egy", "egy-Egyp"],
    ["es", "es-ES"],
    ["fa", "fa-IR"],
    ["fi", "fi-FI"],
    ["fr", "fr-FR"],
    ["he", "he-IL"],
    ["iw", "he-IL"],
    ["hi", "hi-IN"],
    ["hu", "hu-HU"],
    ["id", "id-ID"],
    ["in", "id-ID"],
    ["it", "it-IT"],
    ["ja", "ja-JP"],
    ["akk", "akk-Xsux"],
    ["ko", "ko-KR"],
    ["ms", "ms-MY"],
    ["nb", "nb-NO"],
    ["nn", "nb-NO"],
    ["no", "nb-NO"],
    ["nl", "nl-NL"],
    ["pl", "pl-PL"],
    ["pt", "pt-PT"],
    ["ru", "ru-RU"],
    ["sr", "sr-RS"],
    ["sl", "sl-SI"],
    ["tr", "tr-TR"],
    ["uk", "uk-UA"],
    ["ur", "ur-PK"],
    ["vi", "vi-VN"],
    ["zh-hant", "zh-TW"],
    ["zh-tw", "zh-TW"],
    ["zh", "zh-CN"],
  ];
  for (const candidate of candidates) {
    if (isSupportedLocale(candidate)) {
      return candidate;
    }
    const normalizedCandidate = candidate.toLowerCase();
    const fallback = languageFallbacks.find(([prefix]) =>
      normalizedCandidate.startsWith(prefix),
    );
    if (fallback) {
      return fallback[1];
    }
  }
  return DEFAULT_LOCALE;
};

export const translate = (
  locale: SupportedLocale,
  key: string,
  params?: Params,
): string => {
  const normalizedKey = TRANSLATION_KEY_ALIASES[key] ?? key;
  const historicalBrandTranslation =
    HISTORICAL_LOCALES.has(locale) && normalizedKey === "Iroha Wallet";
  const template =
    (historicalBrandTranslation ? undefined : LITERAL_KEY_OVERRIDES[key]) ??
    (historicalBrandTranslation
      ? undefined
      : LITERAL_KEY_OVERRIDES[normalizedKey]) ??
    TABLES[locale]?.[normalizedKey] ??
    SHARED_ENGLISH_FALLBACK_TRANSLATIONS[normalizedKey] ??
    key;
  const normalizedTemplate = LEGACY_TERM_REPLACEMENTS.reduce(
    (current, [from, to]) => current.split(from).join(to),
    template,
  );
  if (!params) {
    return normalizedTemplate;
  }
  return normalizedTemplate.replace(/\{([\w]+)\}/g, (_match, token) => {
    const value = params[token];
    return value === undefined ? `{${token}}` : String(value);
  });
};

export const getLocaleDirection = (locale: SupportedLocale): LocaleDirection =>
  LOCALE_DIRECTIONS[locale];

export const isRtlLocale = (locale: SupportedLocale): boolean =>
  getLocaleDirection(locale) === "rtl";

export const hasLocaleTranslation = (
  locale: SupportedLocale,
  key: string,
): boolean => {
  if (locale === "en-US") {
    return true;
  }
  if (
    key in LITERAL_KEY_OVERRIDES &&
    !(HISTORICAL_LOCALES.has(locale) && key === "Iroha Wallet")
  ) {
    return true;
  }
  const normalizedKey = TRANSLATION_KEY_ALIASES[key] ?? key;
  if (HISTORICAL_LOCALES.has(locale)) {
    return (
      normalizedKey in TABLES[locale] || normalizedKey in LITERAL_KEY_OVERRIDES
    );
  }
  return (
    normalizedKey in TABLES[locale] ||
    normalizedKey in SHARED_ENGLISH_FALLBACK_TRANSLATIONS ||
    normalizedKey in LITERAL_KEY_OVERRIDES
  );
};
