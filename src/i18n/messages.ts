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

const AR_TRANSLATIONS: TranslationTable = AR_AUTO_TRANSLATIONS;
const AZ_TRANSLATIONS: TranslationTable = AZ_AUTO_TRANSLATIONS;
const CA_TRANSLATIONS: TranslationTable = CA_AUTO_TRANSLATIONS;
const CS_TRANSLATIONS: TranslationTable = CS_AUTO_TRANSLATIONS;
const DE_TRANSLATIONS: TranslationTable = DE_AUTO_TRANSLATIONS;
const ES_TRANSLATIONS: TranslationTable = ES_AUTO_TRANSLATIONS;
const FA_TRANSLATIONS: TranslationTable = FA_AUTO_TRANSLATIONS;
const FI_TRANSLATIONS: TranslationTable = FI_AUTO_TRANSLATIONS;
const FR_TRANSLATIONS: TranslationTable = FR_AUTO_TRANSLATIONS;
const HE_TRANSLATIONS: TranslationTable = HE_AUTO_TRANSLATIONS;
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
const UR_TRANSLATIONS: TranslationTable = UR_AUTO_TRANSLATIONS;
const VI_TRANSLATIONS: TranslationTable = VI_AUTO_TRANSLATIONS;
const ZH_TW_TRANSLATIONS: TranslationTable = ZH_TW_AUTO_TRANSLATIONS;

const TABLES: Record<SupportedLocale, TranslationTable> = {
  "en-US": {},
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
  const template = TABLES[locale]?.[key] ?? key;
  if (!params) {
    return template;
  }
  return template.replace(/\{([\w]+)\}/g, (_match, token) => {
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
  return key in TABLES[locale];
};
