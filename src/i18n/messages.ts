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

export const SUPPORTED_LOCALES = [
  "en-US",
  "ar-SA",
  "az-AZ",
  "ca-ES",
  "cs-CZ",
  "de-DE",
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
  "Modern Torii-connected wallet": "モダンなTorii接続ウォレット",
  Torii: "Torii",
  Chain: "チェーン",
  "Asset not set": "アセット未設定",
  "Switch to light": "ライトモードへ切替",
  "Switch to dark": "ダークモードへ切替",
  Navigate: "ナビゲート",
  "Account ready": "アカウント準備完了",
  "Complete onboarding": "オンボーディングを完了",
  "Complete account setup first": "最初にアカウント設定を完了してください",
  "Complete account onboarding to unlock Setup, Wallet, Staking, Parliament, Send, Receive, Offline, and Explorer.":
    "アカウントのオンボーディングを完了すると、Setup、Wallet、Staking、Parliament、Send、Receive、Offline、Explorerが利用できます。",
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
  "Generate keys, recovery phrase, Connect pairing":
    "鍵・リカバリーフレーズ生成、Connect連携",
  "TAIRA connection, asset, and authority keys": "TAIRA接続、アセット、権限鍵",
  "Balances, assets, and latest transactions":
    "残高、アセット、最新トランザクション",
  "Nominate validators and stake XOR for NPOS":
    "バリデータを指名してXORをNPOSステーク",
  "Bond citizenship and vote in governance referenda":
    "市民権をボンドしガバナンス投票",
  "Auto-deduct and manage recurring services":
    "自動引き落としと定期サービス管理",
  "Transfer assets with camera or QR upload":
    "カメラまたはQRアップロードで送金",
  "Share QR codes or IH58 to request funds": "QRコードまたはIH58で受取依頼",
  "Offline wallets, invoices, and QR exchanges":
    "オフラインウォレット、請求、QR交換",
  "Network metrics and asset explorer": "ネットワーク指標とアセット探索",
  "Session Setup": "セッション設定",
  "Provision your TAIRA testnet account": "TAIRAテストネットアカウントを準備",
  "TAIRA connection & keys": "TAIRA接続と鍵",
  "Wallet Overview": "ウォレット概要",
  "Balances & activity": "残高とアクティビティ",
  "NPOS Staking": "NPOSステーキング",
  "Nominate validators and stake XOR": "バリデータ指名とXORステーク",
  "SORA Parliament": "SORA議会",
  "Citizenship bond and governance voting": "市民権ボンドとガバナンス投票",
  "Subscription Hub": "サブスクリプションハブ",
  "Auto-deduct and manage services": "自動引き落としとサービス管理",
  "Send Points": "ポイント送信",
  "Transfer assets via Torii": "Torii経由でアセット送信",
  "Receive Points": "ポイント受信",
  "Share QR or IH58": "QRまたはIH58を共有",
  Explorer: "エクスプローラー",
  "Network & asset insights": "ネットワークとアセット分析",
  "Offline wallets, invoices, and payments":
    "オフラインウォレット、請求、支払い",
  "TAIRA locked": "TAIRA固定",
  "Open Taira Explorer": "TAIRA Explorerを開く",
  "Iroha logo": "Irohaロゴ",
  "IrohaConnect pairing QR": "IrohaConnectペアリングQR",
  "Explorer account QR": "エクスプローラーのアカウントQR",
  IH58: "IH58",
  Aye: "賛成",
  Nay: "反対",
  Abstain: "棄権",
  "Bond {amount} XOR": "{amount} XORをボンド",
  "Bond XOR": "XORをボンド",
  "Bond amount": "ボンド額",
  "Bond amount (XOR)": "ボンド額 (XOR)",
  "Bond submitted: {hash}": "ボンド送信済み: {hash}",
  "Ballot submitted: {hash}": "投票送信済み: {hash}",
  "Shield mode unavailable: effective policy mode is {mode}.":
    "シールドモードは利用できません: 有効ポリシーモードは {mode} です。",
  "Shield policy check failed: {message}. Submission may still fail if shield mode is unsupported.":
    "シールドポリシー確認に失敗しました: {message}。シールドモード未対応の場合、送信は失敗する可能性があります。",
  "Shield policy check failed. Submission may still fail if shield mode is unsupported.":
    "シールドポリシー確認に失敗しました。シールドモード未対応の場合、送信は失敗する可能性があります。",
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
  Aye: "За",
  Nay: "Против",
  Abstain: "Воздержаться",
  "SORA Parliament": "Парламент SORA",
  "Citizenship bond and governance voting":
    "Гражданский депозит и голосование по управлению",
  "Bond citizenship and vote in governance referenda":
    "Заблокируйте гражданский депозит и голосуйте на референдумах управления",
  "A minimum of {amount} XOR is required to register citizenship.":
    "Для регистрации гражданства требуется минимум {amount} XOR.",
  "Available XOR balance is below the required citizen bond amount.":
    "Доступный баланс XOR ниже требуемой суммы гражданского депозита.",
  "Citizenship Bond": "Гражданский депозит",
  "Citizenship bond submitted: {hash}": "Гражданский депозит отправлен: {hash}",
  "Citizenship voting permission detected. Bonding is no longer required.":
    "Обнаружено право голоса гражданина. Дополнительная блокировка больше не требуется.",
  "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.":
    "У этой учетной записи нет права на голосование. Отправьте гражданский депозит и обновите данные перед голосованием.",
  "Bond {amount} XOR": "Заблокировать {amount} XOR",
  "Bond XOR": "Заблокировать XOR",
  "Bond amount": "Сумма блокировки",
  "Bond amount (XOR)": "Сумма блокировки (XOR)",
  "Bond submitted: {hash}": "Блокировка отправлена: {hash}",
  "Ballot submitted: {hash}": "Голос отправлен: {hash}",
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
  "Nominate validators and stake XOR": "Выберите валидаторов и застейкайте XOR",
  "Nominate validators and stake XOR for NPOS":
    "Выберите валидаторов и застейкайте XOR для NPOS",
  "referendumId and proposalId are required for finalize.":
    "Для finalize требуются referendumId и proposalId.",
  "referendumId is required before submitting a ballot.":
    "Перед отправкой бюллетеня требуется referendumId.",
  "proposalId is required for enact.": "Для enact требуется proposalId.",
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
  Aye: "За",
  Nay: "Проти",
  Abstain: "Утриматися",
  "SORA Parliament": "Парламент SORA",
  "Citizenship bond and governance voting":
    "Громадянський депозит і голосування з управління",
  "Bond citizenship and vote in governance referenda":
    "Заблокуйте громадянський депозит і голосуйте на референдумах з управління",
  "A minimum of {amount} XOR is required to register citizenship.":
    "Для реєстрації громадянства потрібен мінімум {amount} XOR.",
  "Available XOR balance is below the required citizen bond amount.":
    "Доступний баланс XOR нижчий за потрібну суму громадянського депозиту.",
  "Citizenship Bond": "Громадянський депозит",
  "Citizenship bond submitted: {hash}":
    "Громадянський депозит надіслано: {hash}",
  "Citizenship voting permission detected. Bonding is no longer required.":
    "Виявлено право голосу громадянина. Додаткове блокування більше не потрібне.",
  "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.":
    "Для цього акаунта немає дозволу на голосування. Надішліть громадянський депозит і оновіть дані перед голосуванням.",
  "Bond {amount} XOR": "Заблокувати {amount} XOR",
  "Bond XOR": "Заблокувати XOR",
  "Bond amount": "Сума блокування",
  "Bond amount (XOR)": "Сума блокування (XOR)",
  "Bond submitted: {hash}": "Блокування надіслано: {hash}",
  "Ballot submitted: {hash}": "Бюлетень надіслано: {hash}",
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
  "Nominate validators and stake XOR": "Оберіть валідаторів і застейкайте XOR",
  "Nominate validators and stake XOR for NPOS":
    "Оберіть валідаторів і застейкайте XOR для NPOS",
  "referendumId and proposalId are required for finalize.":
    "Для finalize потрібні referendumId і proposalId.",
  "referendumId is required before submitting a ballot.":
    "Перед поданням бюлетеня потрібен referendumId.",
  "proposalId is required for enact.": "Для enact потрібен proposalId.",
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
  Aye: "赞成",
  Nay: "反对",
  "SORA Parliament": "SORA 议会",
  "Citizenship bond and governance voting": "公民保证金与治理投票",
  "Bond citizenship and vote in governance referenda":
    "质押公民保证金并在治理公投中投票",
  "A minimum of {amount} XOR is required to register citizenship.":
    "注册公民身份至少需要 {amount} XOR。",
  "Available XOR balance is below the required citizen bond amount.":
    "可用 XOR 余额低于所需公民保证金金额。",
  "Citizenship Bond": "公民保证金",
  "Citizenship bond submitted: {hash}": "公民保证金已提交：{hash}",
  "Citizenship voting permission detected. Bonding is no longer required.":
    "已检测到公民投票权限，无需继续质押。",
  "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.":
    "该账户缺少投票权限。请先提交公民保证金并刷新后再投票。",
  "Bond {amount} XOR": "质押 {amount} XOR",
  "Bond XOR": "质押 XOR",
  "Bond amount": "质押金额",
  "Bond amount (XOR)": "质押金额（XOR）",
  "Bond submitted: {hash}": "质押已提交：{hash}",
  "Ballot submitted: {hash}": "选票已提交：{hash}",
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
  "Nominate validators and stake XOR": "提名验证者并质押 XOR",
  "Nominate validators and stake XOR for NPOS": "提名验证者并为 NPOS 质押 XOR",
  "referendumId and proposalId are required for finalize.":
    "执行 finalize 需要 referendumId 和 proposalId。",
  "referendumId is required before submitting a ballot.":
    "提交选票前需要 referendumId。",
  "proposalId is required for enact.": "执行 enact 需要 proposalId。",
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
  Nay: "반대",
  "SORA Parliament": "SORA 의회",
  "Citizenship bond and governance voting": "시민권 본딩 및 거버넌스 투표",
  "Bond citizenship and vote in governance referenda":
    "시민권 본딩을 완료하고 거버넌스 국민투표에 참여하세요",
  "A minimum of {amount} XOR is required to register citizenship.":
    "시민권 등록에는 최소 {amount} XOR이 필요합니다.",
  "Available XOR balance is below the required citizen bond amount.":
    "사용 가능한 XOR 잔액이 시민권 본딩 필요 수량보다 부족합니다.",
  "Citizenship Bond": "시민권 본딩",
  "Citizenship bond submitted: {hash}": "시민권 본딩 제출됨: {hash}",
  "Citizenship voting permission detected. Bonding is no longer required.":
    "시민권 투표 권한이 확인되었습니다. 추가 본딩은 필요하지 않습니다.",
  "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.":
    "이 계정에는 투표 권한이 없습니다. 시민권 본딩을 제출하고 새로 고침한 뒤 투표하세요.",
  "Bond {amount} XOR": "{amount} XOR 본딩",
  "Bond XOR": "XOR 본딩",
  "Bond amount": "본딩 수량",
  "Bond amount (XOR)": "본딩 수량 (XOR)",
  "Bond submitted: {hash}": "본딩 제출됨: {hash}",
  "Ballot submitted: {hash}": "투표 제출됨: {hash}",
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
  "Nominate validators and stake XOR": "검증인을 지명하고 XOR을 스테이킹하세요",
  "Nominate validators and stake XOR for NPOS":
    "NPOS용 검증인을 지명하고 XOR을 스테이킹하세요",
  "referendumId and proposalId are required for finalize.":
    "finalize에는 referendumId와 proposalId가 필요합니다.",
  "referendumId is required before submitting a ballot.":
    "투표를 제출하기 전에 referendumId가 필요합니다.",
  "proposalId is required for enact.": "enact에는 proposalId가 필요합니다.",
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
  Aye: "نعم",
  Nay: "لا",
  Abstain: "امتناع",
  "Iroha Points": "نقاط إيروها",
  "Torii control deck": "لوحة تحكم Torii",
  "Modern Torii-connected wallet": "محفظة حديثة متصلة بـ Torii",
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
    "أنشئ المفاتيح وعبارة الاسترداد واقتران Connect",
  "TAIRA connection, asset, and authority keys":
    "اتصال TAIRA والأصل ومفاتيح الصلاحية",
  "Balances, assets, and latest transactions": "الأرصدة والأصول وآخر المعاملات",
  "Auto-deduct and manage recurring services":
    "خصم تلقائي وإدارة الخدمات المتكررة",
  "Transfer assets with camera or QR upload":
    "انقل الأصول بالكاميرا أو عبر رفع QR",
  "Share QR codes or IH58 to request funds":
    "شارك رموز QR أو IH58 لطلب الأموال",
  "Offline wallets, invoices, and QR exchanges":
    "محافظ دون اتصال وفواتير وتبادل QR",
  "Network metrics and asset explorer": "مقاييس الشبكة ومستكشف الأصول",
  "Wallet Overview": "نظرة عامة على المحفظة",
  "Balances & activity": "الأرصدة والنشاط",
  "Subscription Hub": "مركز الاشتراكات",
  "Send Points": "إرسال النقاط",
  "Receive Points": "استلام النقاط",
  "Network & asset insights": "رؤى الشبكة والأصول",
  "SORA Parliament": "برلمان SORA",
  "Citizenship bond and governance voting": "سند المواطنة والتصويت على الحوكمة",
  "Bond citizenship and vote in governance referenda":
    "أودع سند المواطنة وصوّت في استفتاءات الحوكمة",
  "A minimum of {amount} XOR is required to register citizenship.":
    "يتطلب تسجيل المواطنة حدًا أدنى قدره {amount} XOR.",
  "Available XOR balance is below the required citizen bond amount.":
    "رصيد XOR المتاح أقل من قيمة سند المواطنة المطلوبة.",
  "Citizenship Bond": "سند المواطنة",
  "Citizenship bond submitted: {hash}": "تم إرسال سند المواطنة: {hash}",
  "Citizenship voting permission detected. Bonding is no longer required.":
    "تم اكتشاف صلاحية تصويت المواطنة. لم يعد الإيداع مطلوبًا.",
  "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.":
    "صلاحية الاقتراع غير متاحة لهذا الحساب. أرسل سند المواطنة ثم حدّث قبل التصويت.",
  "Bond {amount} XOR": "أودع {amount} XOR",
  "Bond XOR": "أودع XOR",
  "Bond amount": "قيمة الإيداع",
  "Bond amount (XOR)": "قيمة الإيداع (XOR)",
  "Bond submitted: {hash}": "تم إرسال الإيداع: {hash}",
  "Ballot submitted: {hash}": "تم إرسال الاقتراع: {hash}",
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
  "referendumId and proposalId are required for finalize.":
    "يلزم referendumId و proposalId لإتمام finalize.",
  "referendumId is required before submitting a ballot.":
    "يلزم referendumId قبل إرسال الاقتراع.",
  "proposalId is required for enact.": "يلزم proposalId لعملية enact.",
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
  Aye: "موافق",
  Nay: "مخالف",
  Abstain: "ممتنع",
  "Iroha Points": "امتیازهای Iroha",
  "Torii control deck": "داشبورد کنترل Torii",
  "Modern Torii-connected wallet": "کیف پول مدرن متصل به Torii",
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
    "کلیدها، عبارت بازیابی و جفت‌سازی Connect را ایجاد کنید",
  "TAIRA connection, asset, and authority keys":
    "اتصال TAIRA، دارایی و کلیدهای مجوز",
  "Balances, assets, and latest transactions":
    "موجودی‌ها، دارایی‌ها و آخرین تراکنش‌ها",
  "Auto-deduct and manage recurring services":
    "برداشت خودکار و مدیریت خدمات تکرارشونده",
  "Transfer assets with camera or QR upload":
    "دارایی‌ها را با دوربین یا آپلود QR منتقل کنید",
  "Share QR codes or IH58 to request funds":
    "برای درخواست وجه، کد QR یا IH58 را به‌اشتراک بگذارید",
  "Offline wallets, invoices, and QR exchanges":
    "کیف پول آفلاین، فاکتور و تبادل QR",
  "Network metrics and asset explorer": "شاخص‌های شبکه و کاوشگر دارایی",
  "Wallet Overview": "نمای کلی کیف پول",
  "Balances & activity": "موجودی و فعالیت",
  "Subscription Hub": "مرکز اشتراک",
  "Send Points": "ارسال امتیاز",
  "Receive Points": "دریافت امتیاز",
  "Network & asset insights": "بینش شبکه و دارایی",
  "SORA Parliament": "پارلمان SORA",
  "Citizenship bond and governance voting": "باند شهروندی و رای‌گیری حاکمیتی",
  "Bond citizenship and vote in governance referenda":
    "برای شهروندی باند کنید و در همه‌پرسی‌های حاکمیتی رای دهید",
  "A minimum of {amount} XOR is required to register citizenship.":
    "برای ثبت شهروندی حداقل {amount} XOR لازم است.",
  "Available XOR balance is below the required citizen bond amount.":
    "موجودی XOR کمتر از مقدار باند شهروندی موردنیاز است.",
  "Citizenship Bond": "باند شهروندی",
  "Citizenship bond submitted: {hash}": "باند شهروندی ارسال شد: {hash}",
  "Citizenship voting permission detected. Bonding is no longer required.":
    "مجوز رای شهروندی شناسایی شد. دیگر نیازی به باند نیست.",
  "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.":
    "این حساب مجوز رای ندارد. پیش از رای دادن باند شهروندی را ارسال کرده و تازه‌سازی کنید.",
  "Bond {amount} XOR": "باند {amount} XOR",
  "Bond XOR": "باند XOR",
  "Bond amount": "مقدار باند",
  "Bond amount (XOR)": "مقدار باند (XOR)",
  "Bond submitted: {hash}": "باند ارسال شد: {hash}",
  "Ballot submitted: {hash}": "رای ارسال شد: {hash}",
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
  "referendumId and proposalId are required for finalize.":
    "برای finalize به referendumId و proposalId نیاز است.",
  "referendumId is required before submitting a ballot.":
    "پیش از ارسال رای referendumId لازم است.",
  "proposalId is required for enact.": "برای enact به proposalId نیاز است.",
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
  Aye: "בעד",
  Nay: "נגד",
  Abstain: "נמנע",
  "Iroha Points": "נקודות Iroha",
  "Torii control deck": "לוח בקרה של Torii",
  "Modern Torii-connected wallet": "ארנק מודרני המחובר ל-Torii",
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
  "Generate keys, recovery phrase, Connect pairing":
    "יצירת מפתחות, משפט שחזור וצימוד Connect",
  "TAIRA connection, asset, and authority keys":
    "חיבור TAIRA, נכס ומפתחות הרשאה",
  "Balances, assets, and latest transactions": "יתרות, נכסים ועסקאות אחרונות",
  "Auto-deduct and manage recurring services":
    "חיוב אוטומטי וניהול שירותים חוזרים",
  "Transfer assets with camera or QR upload":
    "העברת נכסים עם מצלמה או העלאת QR",
  "Share QR codes or IH58 to request funds":
    "שתפו קודי QR או IH58 כדי לבקש כספים",
  "Offline wallets, invoices, and QR exchanges":
    "ארנקים אופליין, חשבוניות והחלפות QR",
  "Network metrics and asset explorer": "מדדי רשת וסייר נכסים",
  "Wallet Overview": "סקירת ארנק",
  "Balances & activity": "יתרות ופעילות",
  "Subscription Hub": "מרכז מנויים",
  "Send Points": "שליחת נקודות",
  "Receive Points": "קבלת נקודות",
  "Network & asset insights": "תובנות רשת ונכסים",
  "SORA Parliament": "פרלמנט SORA",
  "Citizenship bond and governance voting": "בונד אזרחות והצבעה בממשל",
  "Bond citizenship and vote in governance referenda":
    "בצעו בונד אזרחות והצביעו במשאלי ממשל",
  "A minimum of {amount} XOR is required to register citizenship.":
    "נדרש מינימום של {amount} XOR לרישום אזרחות.",
  "Available XOR balance is below the required citizen bond amount.":
    "יתרת XOR הזמינה נמוכה מסכום בונד האזרחות הנדרש.",
  "Citizenship Bond": "בונד אזרחות",
  "Citizenship bond submitted: {hash}": "בונד האזרחות נשלח: {hash}",
  "Citizenship voting permission detected. Bonding is no longer required.":
    "זוהתה הרשאת הצבעת אזרחות. אין צורך נוסף בבונד.",
  "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.":
    "בחשבון זה חסרה הרשאת הצבעה. שלחו בונד אזרחות ורעננו לפני ההצבעה.",
  "Bond {amount} XOR": "בצעו בונד של {amount} XOR",
  "Bond XOR": "בצעו בונד XOR",
  "Bond amount": "סכום בונד",
  "Bond amount (XOR)": "סכום בונד (XOR)",
  "Bond submitted: {hash}": "הבונד נשלח: {hash}",
  "Ballot submitted: {hash}": "ההצבעה נשלחה: {hash}",
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
  "referendumId and proposalId are required for finalize.":
    "ל-finalize נדרשים referendumId ו-proposalId.",
  "referendumId is required before submitting a ballot.":
    "נדרש referendumId לפני שליחת הצבעה.",
  "proposalId is required for enact.": "נדרש proposalId עבור enact.",
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
  Aye: "ہاں",
  Nay: "نہیں",
  Abstain: "غیر حاضر",
  "Iroha Points": "Iroha پوائنٹس",
  "Torii control deck": "Torii کنٹرول ڈیک",
  "Modern Torii-connected wallet": "جدید Torii سے منسلک والیٹ",
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
  "Generate keys, recovery phrase, Connect pairing":
    "کلیدیں، ریکوری فریز اور Connect پیئرنگ بنائیں",
  "TAIRA connection, asset, and authority keys":
    "TAIRA کنکشن، اثاثہ اور اتھارٹی کلیدیں",
  "Balances, assets, and latest transactions":
    "بیلنس، اثاثے اور تازہ ترین ٹرانزیکشنز",
  "Auto-deduct and manage recurring services":
    "خودکار کٹوتی اور باربار سروسز کا انتظام",
  "Transfer assets with camera or QR upload":
    "کیمرے یا QR اپ لوڈ سے اثاثے منتقل کریں",
  "Share QR codes or IH58 to request funds":
    "فنڈز کی درخواست کے لیے QR کوڈز یا IH58 شیئر کریں",
  "Offline wallets, invoices, and QR exchanges":
    "آف لائن والیٹس، انوائسز اور QR تبادلے",
  "Network metrics and asset explorer": "نیٹ ورک میٹرکس اور اثاثہ ایکسپلورر",
  "Wallet Overview": "والیٹ کا جائزہ",
  "Balances & activity": "بیلنس اور سرگرمی",
  "Subscription Hub": "سبسکرپشن ہب",
  "Send Points": "پوائنٹس بھیجیں",
  "Receive Points": "پوائنٹس وصول کریں",
  "Network & asset insights": "نیٹ ورک اور اثاثہ بصیرت",
  "SORA Parliament": "سورا پارلیمنٹ",
  "Citizenship bond and governance voting": "شہریت بانڈ اور گورننس ووٹنگ",
  "Bond citizenship and vote in governance referenda":
    "شہریت کے لیے بانڈ کریں اور گورننس ریفرنڈم میں ووٹ دیں",
  "A minimum of {amount} XOR is required to register citizenship.":
    "شہریت رجسٹر کرنے کے لیے کم از کم {amount} XOR درکار ہے۔",
  "Available XOR balance is below the required citizen bond amount.":
    "دستیاب XOR بیلنس مطلوبہ شہریت بانڈ سے کم ہے۔",
  "Citizenship Bond": "شہریت بانڈ",
  "Citizenship bond submitted: {hash}": "شہریت بانڈ جمع ہو گیا: {hash}",
  "Citizenship voting permission detected. Bonding is no longer required.":
    "شہری ووٹنگ کی اجازت موجود ہے۔ مزید بانڈنگ درکار نہیں۔",
  "Ballot permission is missing on this account. Submit the citizenship bond and refresh before voting.":
    "اس اکاؤنٹ میں بیلٹ کی اجازت موجود نہیں۔ ووٹنگ سے پہلے شہریت بانڈ جمع کریں اور ریفریش کریں۔",
  "Bond {amount} XOR": "{amount} XOR بانڈ کریں",
  "Bond XOR": "XOR بانڈ کریں",
  "Bond amount": "بانڈ مقدار",
  "Bond amount (XOR)": "بانڈ مقدار (XOR)",
  "Bond submitted: {hash}": "بانڈ جمع ہو گیا: {hash}",
  "Ballot submitted: {hash}": "بیلٹ جمع ہو گیا: {hash}",
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
  "referendumId and proposalId are required for finalize.":
    "finalize کے لیے referendumId اور proposalId درکار ہیں۔",
  "referendumId is required before submitting a ballot.":
    "بیلٹ جمع کرنے سے پہلے referendumId درکار ہے۔",
  "proposalId is required for enact.": "enact کے لیے proposalId درکار ہے۔",
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
  "Invoice asset does not match the active offline asset.":
    "Invoice asset does not match the active offline asset.",
  "Payment asset does not match the active offline asset.":
    "Payment asset does not match the active offline asset.",
  "Create and save your TAIRA wallet": "Create and save your TAIRA wallet",
  "Generate your account keys, store a recovery phrase, and save the wallet locally. Torii registration is optional.":
    "Generate your account keys, store a recovery phrase, and save the wallet locally. Torii registration is optional.",
  "Generate your account keys, store a recovery phrase, and save the wallet locally. On-chain alias registration is optional.":
    "Generate your account keys, store a recovery phrase, and save the wallet locally. On-chain alias registration is optional.",
  Advanced: "Advanced",
  "Hide advanced": "Hide advanced",
  "Optional on-chain alias registration":
    "Optional on-chain alias registration",
  "This submits the UAID alias registration flow when the endpoint supports it. Your wallet already works without this step.":
    "This submits the UAID alias registration flow when the endpoint supports it. Your wallet already works without this step.",
  "Alias Metadata (JSON, optional)": "Alias Metadata (JSON, optional)",
  "Register on-chain alias": "Register on-chain alias",
  "Registering alias…": "Registering alias…",
  "On-chain alias {accountId} queued (tx {txHash}…)":
    "On-chain alias {accountId} queued (tx {txHash}…)",
  "On-chain alias registration is unavailable on this Torii endpoint. The wallet was saved locally instead.":
    "On-chain alias registration is unavailable on this Torii endpoint. The wallet was saved locally instead.",
  "Saved Wallets": "Saved Wallets",
  "Switch between saved wallets or begin a fresh wallet setup.":
    "Switch between saved wallets or begin a fresh wallet setup.",
  "No saved wallets yet. Complete the wallet setup form to add one.":
    "No saved wallets yet. Complete the wallet setup form to add one.",
  "Add another wallet": "Add another wallet",
  "Switch between saved profiles or begin a fresh wallet setup.":
    "Switch between saved profiles or begin a fresh wallet setup.",
  "No saved accounts yet. Complete the wallet setup form to add one.":
    "No saved accounts yet. Complete the wallet setup form to add one.",
  default: "default",
  "Canonical I105 Account ID": "I105 Account ID",
  "Example I105 Account ID":
    "n42uﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV",
  "Canonical I105 account IDs are compact literals and may look like 6cmz..., not i105:.":
    "Real TAIRA I105 account IDs are kana-based literals and may look like n42u..., not 6cmz... or i105:.",
  "Use the real Base58 I105 account literal, for example {example}. Do not use @domain or i105: forms.":
    "Use the real TAIRA I105 literal, for example {example}. Do not use @domain, legacy compatibility literals, or i105: forms.",
  "Use the real TAIRA I105 literal, for example {example}. Do not use @domain, legacy compatibility literals, or i105: forms.":
    "Use the real TAIRA I105 literal, for example {example}. Do not use @domain, legacy compatibility literals, or i105: forms.",
  "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not a TAIRA dataspace alias.":
    "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not a TAIRA dataspace alias.",
  "Faucet Request": "Faucet Request",
  "Top up a new TAIRA account once with starter XOR.":
    "Top up a new TAIRA account once with starter XOR.",
  "Claim Testnet XOR": "Claim Testnet XOR",
  "Requesting…": "Requesting…",
  "Testnet XOR requested: {hash}": "Testnet XOR requested: {hash}",
  "Failed to request faucet funds.": "Failed to request faucet funds.",
  "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or registered.":
    "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or registered.",
  "Wallet data is unavailable until this account exists on-chain.":
    "Wallet data is unavailable until this account exists on-chain.",
  "Account {accountId} saved locally.": "Account {accountId} saved locally.",
  "UAID onboarding is unavailable on this Torii endpoint. The wallet was saved locally instead.":
    "UAID onboarding is unavailable on this Torii endpoint. The wallet was saved locally instead.",
};
const EN_TRANSLATIONS: TranslationTable = {
  IH58: "I105",
  I105: "I105",
  "Share QR or IH58": "Share QR or Account ID",
  "Share QR or Account ID": "Share QR or Account ID",
  "Share QR codes or IH58 to request funds":
    "Share QR codes or account IDs to request funds",
  "Share QR codes or account IDs to request funds":
    "Share QR codes or account IDs to request funds",
  "34m... or 0x...@wonderland": "Example I105 Account ID",
  "n42u... (I105 account ID)": "Example I105 Account ID",
  "6cmz... (canonical I105 account ID)": "Example I105 Account ID",
  "rose#wonderland": "norito:<asset-id-hex>",
  "norito:<asset-id-hex>": "norito:<asset-id-hex>",
};

const TABLES: Record<SupportedLocale, TranslationTable> = {
  "en-US": EN_TRANSLATIONS,
  "ar-SA": AR_TRANSLATIONS,
  "az-AZ": AZ_TRANSLATIONS,
  "ca-ES": CA_TRANSLATIONS,
  "cs-CZ": CS_TRANSLATIONS,
  "de-DE": DE_TRANSLATIONS,
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

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

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
  "n42u... (I105 account ID)": "Example I105 Account ID",
  "6cmz... (canonical I105 account ID)": "Example I105 Account ID",
  "34m... or 0x...@wonderland": "Example I105 Account ID",
  "norito:<asset-id-hex>": "rose#wonderland",
};

const LITERAL_KEY_OVERRIDES: Record<string, string> = {
  "Iroha Wallet": "Iroha Wallet",
  IH58: "I105",
  I105: "I105",
  "Example I105 Account ID":
    "n42uﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV",
  "rose#wonderland": "norito:<asset-id-hex>",
  "norito:<asset-id-hex>": "norito:<asset-id-hex>",
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
  const template =
    LITERAL_KEY_OVERRIDES[key] ??
    LITERAL_KEY_OVERRIDES[normalizedKey] ??
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
  if (key in LITERAL_KEY_OVERRIDES) {
    return true;
  }
  const normalizedKey = TRANSLATION_KEY_ALIASES[key] ?? key;
  return (
    normalizedKey in TABLES[locale] ||
    normalizedKey in SHARED_ENGLISH_FALLBACK_TRANSLATIONS ||
    normalizedKey in LITERAL_KEY_OVERRIDES
  );
};
