/**
 * Script-native translations for the app's two historical-language locales.
 *
 * These tables deliberately translate meaning instead of spelling English UI
 * words phonetically in an ancient script. Compact dictionary forms are used
 * where they are attested; modern concepts are conservative compounds of
 * attested words. They are UI calques, not claims that an ancient source used
 * the complete phrase. Product names, protocol names, IDs, and symbols remain
 * unchanged elsewhere in the interface.
 *
 * Egyptian lexical source: Thesaurus Linguae Aegyptiae
 * https://thesaurus-linguae-aegyptiae.de/
 *
 * Old Akkadian lexical source: I. J. Gelb, Materials for the Assyrian
 * Dictionary 3, Glossary of Old Akkadian
 * https://isac.uchicago.edu/sites/default/files/uploads/shared/docs/mad3.pdf
 *
 * Sign/orthography reference: I. J. Gelb, Materials for the Assyrian
 * Dictionary 2, Old Akkadian Writing and Grammar
 * https://isac.uchicago.edu/sites/default/files/uploads/shared/docs/mad2.pdf
 */

const EGYPTIAN = {
  account: "𓎛𓋴𓃀𓅱𓐎𓏥",
  active: "𓋹𓈖𓐍",
  advanced: "𓋴𓊪𓂧𓇮",
  balance: "𓊃𓊪𓊗",
  bridge: "𓄥𓄿",
  close: "𓐍𓏏𓅓𓋩",
  copy: "𓁹 𓏇𓏏𓏏𓏛",
  council: "𓍑𓍑𓏌𓏏𓐖",
  create: "𓁹",
  daily: "𓂋𓂝𓇳𓎟",
  dark: "𓇋𓂝𓎛𓇹",
  error: "𓅱𓉔𓅪",
  explore: "𓅱𓆼𓄿𓂻",
  grow: "𓂋𓂧𓇟",
  language: "𓌃𓂧𓅱𓀁",
  light: "𓂋𓂝𓇳",
  meeting: "𓂧𓋬𓅓𓆓𓏛",
  money: "𓌉𓋞𓈓",
  name: "𓂋𓈖",
  offline: "𓌡𓂝𓏏𓏭",
  open: "𓊃𓃹𓈖𓉿𓂡",
  private: "𓋴𓈙𓏏𓍔𓄿𓏛",
  ready: "𓎼𓂋𓍅𓏛",
  receive: "𓊏𓊪𓂡",
  restore: "𓂝𓌳𓅱𓏭𓏛",
  save: "𓋴𓏠𓈖𓏛",
  search: "𓅱𓆼𓄿𓂻",
  send: "𓊄𓃀𓂻",
  services: "𓂓𓏏𓀋",
  settings: "𓁶𓏤𓂾",
  share: "𓊪𓋴𓈙",
  sky: "𓊪𓏏𓇯",
  stake: "𓎝𓎛𓏛",
  stats: "𓇋𓊪𓏏𓏛",
  subscriptions: "𓄙𓅓 𓄯𓋴𓅱",
  total: "𓂧𓋬𓅓𓆓𓏛",
  wallet: "𓉐𓌉",
  workspace: "𓊨𓏏𓉐",
} as const;

const AKKADIAN = {
  account: "𒃻𒋃",
  active: "𒋾𒆷",
  balance: "𒅆𒀉𒌈",
  bridge: "𒋾𒌉𒊒",
  close: "𒋙",
  copy: "𒊭𒁕𒀸",
  council: "𒌺",
  create: "𒁀𒈾𒌝",
  daily: "𒌓",
  dark: "𒌚",
  error: "𒆷 𒆠𒉡𒌝",
  explore: "𒅆",
  language: "𒅴",
  light: "𒌓",
  network: "𒊏𒅗𒋧",
  offline: "𒆷 𒊏𒅗𒋧",
  open: "𒁁",
  ready: "𒂵𒈪𒀸",
  receive: "𒈠𒄩𒀸",
  restore: "𒋫𒀀𒀸",
  save: "𒈾𒍝𒀸",
  send: "𒁕𒊏𒌈",
  services: "𒅋𒄣",
  settings: "𒊭𒅗𒉡𒌝",
  share: "𒍪𒀀𒍮",
  stake: "𒈾𒁕𒉡𒌝",
  stats: "𒋃",
  subscriptions: "𒅋𒄣 𒈾𒁕𒉡𒌝",
  total: "𒈾𒀊𒄩𒀸",
  wallet: "𒆬𒌓",
  workspace: "𒂍",
} as const;

export type HistoricalLocale = "egy-Egyp" | "akk-Xsux";

/**
 * Modern product/protocol names and machine literals that must retain their
 * spelling to stay identifiable or copy-safe. Natural-language UI words do
 * not belong here: they must pass through the semantic composer below.
 */
export const HISTORICAL_TECHNICAL_TERMS = [
  "ABI",
  "API",
  "APY",
  "AppKit",
  "Base58",
  "Base58Check",
  "BSC",
  "BTC",
  "CAIP",
  "Chromium",
  "DAI",
  "DNS",
  "DOT",
  "Electron",
  "ETH",
  "Groth16",
  "HTTP",
  "HTTPS",
  "Hugging",
  "Face",
  "HHI",
  "HUD",
  "I105",
  "ICE",
  "ID",
  "Iroha",
  "IrohaConnect",
  "IVM",
  "JSON",
  "KSM",
  "Kaigi",
  "Linux",
  "MINAMOTO",
  "MTU",
  "macOS",
  "NFT",
  "NPOS",
  "Norito",
  "OK",
  "OS",
  "P99",
  "PoW",
  "PSWAP",
  "QR",
  "QC",
  "RPC",
  "SCCP",
  "SDK",
  "SDP",
  "SHA-256",
  "SORA",
  "Solana",
  "Sora",
  "SoraCloud",
  "STUN",
  "Sumeragi",
  "TAIRA",
  "TON",
  "Torii",
  "TRON",
  "TRX",
  "TURN",
  "Tx",
  "UAID",
  "URL",
  "VAL",
  "VPN",
  "VRF",
  "WalletConnect",
  "WebRTC",
  "Windows",
  "XOR",
  "XSTUSD",
  "ZK",
] as const;

const HISTORICAL_TECHNICAL_TERM_SET = new Set<string>(
  HISTORICAL_TECHNICAL_TERMS,
);

type HistoricalConcept =
  | "absence"
  | "account"
  | "action"
  | "active"
  | "address"
  | "advanced"
  | "amount"
  | "approve"
  | "asset"
  | "audio"
  | "balance"
  | "bridge"
  | "camera"
  | "citizen"
  | "close"
  | "contract"
  | "copy"
  | "council"
  | "create"
  | "data"
  | "device"
  | "error"
  | "explore"
  | "fee"
  | "final"
  | "grow"
  | "health"
  | "language"
  | "light"
  | "link"
  | "meeting"
  | "message"
  | "money"
  | "name"
  | "network"
  | "offline"
  | "open"
  | "payment"
  | "permission"
  | "private"
  | "proof"
  | "public"
  | "ready"
  | "receive"
  | "record"
  | "restore"
  | "route"
  | "save"
  | "search"
  | "send"
  | "service"
  | "settings"
  | "share"
  | "stake"
  | "stats"
  | "subscription"
  | "time"
  | "total"
  | "transaction"
  | "validator"
  | "vote"
  | "wait"
  | "warning"
  | "water"
  | "workspace";

/**
 * Compact semantic vocabulary used to calque modern wallet concepts. The
 * values are script-native dictionary forms/sign groups, not English sounds
 * respelled in hieroglyphs or cuneiform.
 */
const HISTORICAL_CONCEPTS: Record<
  HistoricalLocale,
  Record<HistoricalConcept, string>
> = {
  "egy-Egyp": {
    absence: "𓂜",
    account: EGYPTIAN.account,
    action: "𓂝𓏤",
    active: EGYPTIAN.active,
    address: "𓊨𓏏𓉐",
    advanced: EGYPTIAN.advanced,
    amount: "𓇋𓊪𓏏𓏛",
    approve: EGYPTIAN.save,
    asset: EGYPTIAN.money,
    audio: EGYPTIAN.language,
    balance: EGYPTIAN.balance,
    bridge: EGYPTIAN.bridge,
    camera: "𓁹𓏛",
    citizen: "𓀀𓏥",
    close: EGYPTIAN.close,
    contract: "𓂝𓈙𓏏𓏛",
    copy: EGYPTIAN.copy,
    council: EGYPTIAN.council,
    create: EGYPTIAN.create,
    data: "𓏞𓏛",
    device: "𓌳𓏏𓏛",
    error: EGYPTIAN.error,
    explore: EGYPTIAN.explore,
    fee: EGYPTIAN.money,
    final: "𓏏𓅱𓏭𓏛",
    grow: EGYPTIAN.grow,
    health: "𓋹𓅱𓆑𓏏",
    language: EGYPTIAN.language,
    light: EGYPTIAN.light,
    link: EGYPTIAN.bridge,
    meeting: EGYPTIAN.meeting,
    message: "𓌃𓂧𓅱𓏛",
    money: EGYPTIAN.money,
    name: EGYPTIAN.name,
    network: EGYPTIAN.bridge,
    offline: EGYPTIAN.offline,
    open: EGYPTIAN.open,
    payment: EGYPTIAN.money,
    permission: EGYPTIAN.council,
    private: EGYPTIAN.private,
    proof: "𓐍𓂋𓏏𓏛",
    public: EGYPTIAN.open,
    ready: EGYPTIAN.ready,
    receive: EGYPTIAN.receive,
    record: "𓏞𓏛",
    restore: EGYPTIAN.restore,
    route: "𓅱𓄿𓏏𓏛",
    save: EGYPTIAN.save,
    search: EGYPTIAN.search,
    send: EGYPTIAN.send,
    service: EGYPTIAN.services,
    settings: EGYPTIAN.settings,
    share: EGYPTIAN.share,
    stake: EGYPTIAN.stake,
    stats: EGYPTIAN.stats,
    subscription: EGYPTIAN.subscriptions,
    time: EGYPTIAN.daily,
    total: EGYPTIAN.total,
    transaction: EGYPTIAN.send,
    validator: "𓂧𓈙𓏏𓀀",
    vote: EGYPTIAN.council,
    wait: "𓂋𓏤𓏛",
    warning: EGYPTIAN.error,
    water: "𓈗",
    workspace: EGYPTIAN.workspace,
  },
  "akk-Xsux": {
    absence: "𒆷",
    account: AKKADIAN.account,
    action: "𒋗",
    active: AKKADIAN.active,
    address: "𒆠𒂍",
    advanced: "𒍪",
    amount: "𒋡",
    approve: AKKADIAN.save,
    asset: AKKADIAN.wallet,
    audio: AKKADIAN.language,
    balance: AKKADIAN.balance,
    bridge: AKKADIAN.bridge,
    camera: AKKADIAN.explore,
    citizen: "𒇽𒈨𒌍",
    close: AKKADIAN.close,
    contract: "𒁾𒁲",
    copy: AKKADIAN.copy,
    council: AKKADIAN.council,
    create: AKKADIAN.create,
    data: "𒁾",
    device: "𒄑",
    error: AKKADIAN.error,
    explore: AKKADIAN.explore,
    fee: AKKADIAN.wallet,
    final: "𒋗𒌑",
    grow: AKKADIAN.stake,
    health: "𒋾",
    language: AKKADIAN.language,
    light: AKKADIAN.light,
    link: AKKADIAN.bridge,
    meeting: AKKADIAN.council,
    message: "𒅗𒁾",
    money: AKKADIAN.wallet,
    name: "𒈬",
    network: AKKADIAN.network,
    offline: AKKADIAN.offline,
    open: AKKADIAN.open,
    payment: AKKADIAN.wallet,
    permission: "𒈗",
    private: "𒆗",
    proof: "𒄿𒈾",
    public: AKKADIAN.open,
    ready: AKKADIAN.ready,
    receive: AKKADIAN.receive,
    record: "𒁾",
    restore: AKKADIAN.restore,
    route: "𒆜",
    save: AKKADIAN.save,
    search: AKKADIAN.explore,
    send: AKKADIAN.send,
    service: AKKADIAN.services,
    settings: AKKADIAN.settings,
    share: AKKADIAN.share,
    stake: AKKADIAN.stake,
    stats: AKKADIAN.stats,
    subscription: AKKADIAN.subscriptions,
    time: AKKADIAN.daily,
    total: AKKADIAN.total,
    transaction: AKKADIAN.send,
    validator: "𒁲𒅔",
    vote: AKKADIAN.council,
    wait: "𒌑𒋢",
    warning: AKKADIAN.error,
    water: "𒀀",
    workspace: AKKADIAN.workspace,
  },
};

const CONCEPT_ALIASES: Readonly<
  Partial<Record<HistoricalConcept, readonly string[]>>
> = {
  absence: [
    "absent",
    "disable",
    "disabled",
    "empty",
    "lack",
    "neither",
    "no",
    "none",
    "not",
    "nothing",
    "off",
    "without",
  ],
  account: [
    "account",
    "authority",
    "caller",
    "guest",
    "holder",
    "host",
    "identity",
    "member",
    "owner",
    "participant",
    "recipient",
    "sender",
    "user",
    "wallet",
  ],
  action: [
    "action",
    "apply",
    "control",
    "execute",
    "instruction",
    "manage",
    "operation",
    "process",
    "step",
    "tool",
  ],
  active: [
    "active",
    "automatic",
    "current",
    "enabled",
    "live",
    "online",
    "running",
    "working",
  ],
  address: [
    "address",
    "destination",
    "domain",
    "endpoint",
    "location",
    "place",
    "room",
    "target",
  ],
  advanced: [
    "advanced",
    "canonical",
    "developer",
    "diagnostic",
    "expert",
    "raw",
    "technical",
  ],
  amount: [
    "amount",
    "concentration",
    "duration",
    "height",
    "limit",
    "measure",
    "number",
    "quantity",
    "up",
    "unit",
    "value",
    "whole",
  ],
  approve: [
    "accept",
    "allow",
    "approve",
    "authorize",
    "confirm",
    "grant",
    "yes",
  ],
  asset: ["asset", "coin", "fund", "token"],
  audio: ["audio", "mic", "microphone", "sound", "voice"],
  balance: ["balance", "holding", "position"],
  bridge: ["bridge", "connect", "connection", "pair", "relay", "tunnel"],
  camera: [
    "camera",
    "capture",
    "frame",
    "image",
    "media",
    "preview",
    "screen",
    "video",
    "visible",
  ],
  citizen: ["citizen", "citizenship", "people", "person", "roster"],
  close: [
    "cancel",
    "close",
    "deny",
    "disconnect",
    "end",
    "exit",
    "hang",
    "hide",
    "leave",
    "mute",
    "nay",
    "reject",
    "remove",
    "stop",
  ],
  contract: [
    "agreement",
    "bond",
    "contract",
    "lease",
    "manifest",
    "policy",
    "subscription",
  ],
  copy: ["clipboard", "copy", "decode", "duplicate", "paste", "scan", "upload"],
  council: [
    "ballot",
    "challenge",
    "council",
    "governance",
    "parliament",
    "referendum",
    "sortition",
  ],
  create: [
    "add",
    "assemble",
    "build",
    "create",
    "deploy",
    "derive",
    "generate",
    "issue",
    "launch",
    "make",
    "mint",
    "prepare",
    "register",
    "start",
  ],
  data: [
    "activity",
    "artifact",
    "byte",
    "data",
    "detail",
    "evidence",
    "information",
    "metadata",
    "payload",
    "result",
    "summary",
  ],
  device: [
    "app",
    "application",
    "browser",
    "device",
    "environment",
    "interface",
    "module",
    "system",
    "worker",
  ],
  error: [
    "blocked",
    "could",
    "denied",
    "error",
    "expire",
    "fail",
    "invalid",
    "mismatch",
    "missing",
    "orphan",
    "reject",
    "unavailable",
    "unknown",
    "wrong",
  ],
  explore: [
    "check",
    "explore",
    "find",
    "inspect",
    "look",
    "monitor",
    "observe",
    "read",
    "review",
    "search",
    "show",
    "view",
  ],
  fee: ["charge", "commission", "cost", "fee", "gas", "price"],
  final: [
    "complete",
    "commit",
    "done",
    "enact",
    "final",
    "finalize",
    "finish",
    "settle",
    "success",
  ],
  grow: ["grow", "increase", "reward", "yield"],
  health: ["health", "healthy", "life", "status"],
  language: ["language", "speech"],
  light: ["dark", "light", "mode", "theme"],
  link: ["invite", "link", "signal", "signaling"],
  meeting: ["call", "conference", "meeting"],
  message: [
    "answer",
    "comment",
    "memo",
    "message",
    "note",
    "offer",
    "packet",
    "phrase",
    "proposal",
    "request",
    "response",
    "word",
  ],
  money: ["cash", "currency", "money", "supply", "treasury"],
  name: ["alias", "label", "name", "title"],
  network: [
    "chain",
    "consensus",
    "lane",
    "mainnet",
    "network",
    "node",
    "peer",
    "testnet",
  ],
  offline: ["anonymous", "offline", "manual", "local"],
  open: ["open", "unlock", "unmute"],
  payment: ["faucet", "invoice", "pay", "payment"],
  permission: [
    "eligibility",
    "only",
    "permission",
    "privilege",
    "role",
    "security",
  ],
  private: [
    "confidential",
    "encrypted",
    "privacy",
    "private",
    "secret",
    "shield",
  ],
  proof: ["hash", "proof", "prove", "signature", "signed", "verify", "witness"],
  public: ["public", "transparent"],
  ready: [
    "available",
    "eligible",
    "found",
    "prepared",
    "ready",
    "supported",
    "valid",
  ],
  receive: [
    "collect",
    "fetch",
    "get",
    "import",
    "join",
    "load",
    "receive",
    "request",
  ],
  record: ["file", "history", "log", "record", "report", "table"],
  restore: [
    "back",
    "fallback",
    "recover",
    "refresh",
    "repair",
    "reset",
    "restore",
    "retry",
    "return",
  ],
  route: ["direction", "path", "route", "stage", "way", "window"],
  save: [
    "backup",
    "keep",
    "persist",
    "preserve",
    "recovery",
    "save",
    "secure",
    "store",
  ],
  search: ["lookup", "search"],
  send: [
    "broadcast",
    "export",
    "publish",
    "send",
    "share",
    "submit",
    "transfer",
  ],
  service: ["deployment", "job", "plan", "service", "work"],
  settings: [
    "configure",
    "default",
    "edit",
    "option",
    "preference",
    "profile",
    "select",
    "setting",
    "switch",
  ],
  share: ["give", "share"],
  stake: ["bonded", "nominate", "stake", "staking", "unstake"],
  stats: [
    "count",
    "distribution",
    "metric",
    "pressure",
    "saturation",
    "stat",
    "telemetry",
    "total",
  ],
  subscription: ["recurring", "subscription"],
  time: [
    "day",
    "expiry",
    "hour",
    "period",
    "recent",
    "second",
    "time",
    "today",
  ],
  total: ["all", "full", "maximum", "minimum", "total"],
  transaction: ["burn", "claim", "transaction", "transfer", "unshield"],
  validator: ["operator", "prover", "validator", "verifier"],
  vote: ["abstain", "aye", "ballot", "tally", "vote", "voting"],
  wait: [
    "collecting",
    "gathering",
    "idle",
    "indexing",
    "loading",
    "pending",
    "progress",
    "queue",
    "sync",
    "wait",
  ],
  warning: ["caution", "warning"],
  water: ["faucet", "water"],
  workspace: ["area", "dashboard", "page", "workspace"],
};

const TOKEN_TO_CONCEPT = new Map<string, HistoricalConcept>();
for (const [concept, aliases] of Object.entries(CONCEPT_ALIASES) as Array<
  [HistoricalConcept, readonly string[]]
>) {
  TOKEN_TO_CONCEPT.set(concept, concept);
  for (const alias of aliases) {
    TOKEN_TO_CONCEPT.set(alias, concept);
  }
}

const SEMANTIC_STOP_WORDS = new Set([
  "a",
  "after",
  "again",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "before",
  "being",
  "between",
  "both",
  "but",
  "by",
  "can",
  "does",
  "during",
  "each",
  "every",
  "few",
  "first",
  "for",
  "from",
  "has",
  "have",
  "here",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "must",
  "of",
  "on",
  "one",
  "only",
  "or",
  "other",
  "our",
  "same",
  "so",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "up",
  "use",
  "used",
  "using",
  "via",
  "was",
  "we",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "would",
  "you",
  "your",
  "yet",
]);

const UI_TOKEN_PATTERN =
  /\{[\w]+\}|https?:\/\/[^\s]+|\/v\d+\/[^\s]+|[A-Za-z][A-Za-z0-9]*(?:[-_.:/+@#][A-Za-z0-9]+)*|\d+(?:[.,]\d+)*|[%+→←↔]|[…!?;:,.()[\]]/g;

const normalizeNaturalToken = (token: string): string => {
  const lower = token.toLowerCase();
  const candidates = [
    lower,
    lower.replace(/ies$/u, "y"),
    lower.replace(/ing$/u, ""),
    lower.replace(/ed$/u, ""),
    lower.replace(/es$/u, ""),
    lower.replace(/s$/u, ""),
    lower.replace(/ly$/u, ""),
  ];
  return (
    candidates.find((candidate) => TOKEN_TO_CONCEPT.has(candidate)) ?? lower
  );
};

/**
 * True only for protocol/product names or copy-sensitive machine literals.
 * Structural identifiers (paths, URLs, and camelCase fields) are retained
 * because translating them would make diagnostics and
 * payload instructions unsafe.
 */
export const isHistoricalTechnicalToken = (token: string): boolean => {
  if (HISTORICAL_TECHNICAL_TERM_SET.has(token)) {
    return true;
  }
  return (
    /^https?:\/\//u.test(token) ||
    /^\/v\d+\//u.test(token) ||
    /^[a-z]+(?:[A-Z][A-Za-z0-9]*)+$/u.test(token) ||
    /^[A-Za-z][A-Za-z0-9]*(?:Id|ID|Url|URL|Hash|Key|Bytes)$/u.test(token) ||
    /^[A-Za-z0-9_-]+\.(?:json|wasm|js|mjs|ts|rs)$/u.test(token) ||
    /^[A-Za-z0-9_.-]+#[A-Za-z0-9_.-]+$/u.test(token) ||
    /^[A-Za-z0-9_.-]+@[A-Za-z0-9_.:-]+$/u.test(token) ||
    /^[a-z0-9.-]+\.[a-z]{2,}$/iu.test(token)
  );
};

const semanticConceptsForToken = (token: string): HistoricalConcept[] => {
  const direct = normalizeNaturalToken(token);
  const directConcept = TOKEN_TO_CONCEPT.get(direct);
  if (directConcept) {
    return [directConcept];
  }
  if (token.includes("-")) {
    return token.split("-").flatMap((part) => semanticConceptsForToken(part));
  }
  return SEMANTIC_STOP_WORDS.has(direct) ? [] : ["data"];
};

const isPlaceholder = (token: string): boolean => /^\{[\w]+\}$/u.test(token);

/**
 * Produces a concise native-script semantic gloss. Unknown modern nuance is
 * represented by the native "record/information" concept; English is never
 * transliterated into ancient signs and never leaks through as fallback copy.
 */
export const composeHistoricalTranslation = (
  locale: HistoricalLocale,
  english: string,
): string => {
  const vocabulary = HISTORICAL_CONCEPTS[locale];
  const parts: string[] = [];
  const append = (value: string) => {
    if (value && parts.at(-1) !== value) {
      parts.push(value);
    }
  };

  for (const token of english.match(UI_TOKEN_PATTERN) ?? []) {
    if (isPlaceholder(token) || isHistoricalTechnicalToken(token)) {
      append(token);
      continue;
    }
    if (/^\d/u.test(token) || /^[%+→←↔]$/u.test(token)) {
      append(token);
      continue;
    }
    if (/^[A-Za-z]/u.test(token)) {
      for (const concept of semanticConceptsForToken(token)) {
        append(vocabulary[concept]);
      }
      continue;
    }
    if (/^[…!?]$/u.test(token)) {
      append(token);
    }
  }

  return parts.join(" ") || vocabulary.data;
};

/** Materializes every English UI entry so no historical locale can fall back. */
export const buildHistoricalTranslationTable = (
  locale: HistoricalLocale,
  englishTable: Readonly<Record<string, string>>,
  handTranslations: Readonly<Record<string, string>>,
): Record<string, string> => {
  const keys = new Set([
    ...Object.keys(englishTable),
    ...Object.keys(handTranslations),
  ]);
  return Object.fromEntries(
    [...keys].map((key) => [
      key,
      handTranslations[key] ??
        composeHistoricalTranslation(locale, englishTable[key] ?? key),
    ]),
  );
};

export const EGYPTIAN_TRANSLATIONS = {
  Navigate: EGYPTIAN.open,
  Daily: EGYPTIAN.daily,
  Grow: EGYPTIAN.grow,
  Services: EGYPTIAN.services,
  Settings: EGYPTIAN.settings,
  "Endpoint and app preferences": EGYPTIAN.settings,
  Advanced: EGYPTIAN.advanced,
  "Advanced settings": `${EGYPTIAN.advanced} ${EGYPTIAN.settings}`,
  "Network and developer settings": `${EGYPTIAN.bridge} ${EGYPTIAN.settings}`,
  "Saved Wallets": `${EGYPTIAN.save} ${EGYPTIAN.wallet}`,
  "Create, restore, or switch wallets": `${EGYPTIAN.create} · ${EGYPTIAN.restore} · ${EGYPTIAN.bridge} ${EGYPTIAN.wallet}`,
  Wallet: EGYPTIAN.wallet,
  "Iroha Wallet": `Iroha ${EGYPTIAN.wallet}`,
  "Open wallet": `${EGYPTIAN.open} ${EGYPTIAN.wallet}`,
  "Balance, funding, and activity": `${EGYPTIAN.balance} · ${EGYPTIAN.money} · ${EGYPTIAN.active}`,
  Send: EGYPTIAN.send,
  "Pay with a QR or account": `${EGYPTIAN.send} · QR · ${EGYPTIAN.account}`,
  Receive: EGYPTIAN.receive,
  "Show a payment QR": `${EGYPTIAN.receive} · QR`,
  Staking: EGYPTIAN.stake,
  "Stake XOR": `${EGYPTIAN.stake} XOR`,
  "Choose a validator and manage stake": `${EGYPTIAN.stake} · ${EGYPTIAN.settings}`,
  Governance: EGYPTIAN.council,
  "Bond citizenship and vote in governance referenda": `${EGYPTIAN.stake} ${EGYPTIAN.council}`,
  "Citizenship, referenda, ballots, and council status": EGYPTIAN.council,
  Subscriptions: EGYPTIAN.subscriptions,
  "Recurring payments": EGYPTIAN.subscriptions,
  Stats: EGYPTIAN.stats,
  "Network health": `${EGYPTIAN.bridge} ${EGYPTIAN.active}`,
  "Supply, activity, and explorer signals": `${EGYPTIAN.total} · ${EGYPTIAN.active} · ${EGYPTIAN.explore}`,
  Explore: EGYPTIAN.explore,
  Explorer: EGYPTIAN.explore,
  "Explorer QR and network status": `${EGYPTIAN.explore} · QR · ${EGYPTIAN.bridge}`,
  SoraCloud: "SoraCloud",
  "Launch and monitor live services": `${EGYPTIAN.active} ${EGYPTIAN.services}`,
  VPN: `${EGYPTIAN.private} ${EGYPTIAN.bridge}`,
  "Sora VPN": `Sora ${EGYPTIAN.private} ${EGYPTIAN.bridge}`,
  "Private network connection": `${EGYPTIAN.private} ${EGYPTIAN.bridge}`,
  Kaigi: EGYPTIAN.meeting,
  "Wallet-based meeting links": `${EGYPTIAN.wallet} · ${EGYPTIAN.meeting} · ${EGYPTIAN.bridge}`,
  Offline: EGYPTIAN.offline,
  "Device payments and invoices": `${EGYPTIAN.offline} ${EGYPTIAN.money}`,
  "SCCP Bridge": `SCCP ${EGYPTIAN.bridge}`,
  "TAIRA, TRON, and BSC XOR bridge": `TAIRA · TRON · BSC · XOR · ${EGYPTIAN.bridge}`,
  Network: EGYPTIAN.bridge,
  Connection: EGYPTIAN.bridge,
  Language: EGYPTIAN.language,
  "Switch to light": EGYPTIAN.light,
  "Switch to dark": EGYPTIAN.dark,
  Account: EGYPTIAN.account,
  "Active account": `${EGYPTIAN.active} ${EGYPTIAN.account}`,
  "No active wallet": EGYPTIAN.wallet,
  "Select account": EGYPTIAN.account,
  "Wallet name": `${EGYPTIAN.wallet} ${EGYPTIAN.name}`,
  "Wallet identity": `${EGYPTIAN.wallet} ${EGYPTIAN.name}`,
  "Wallet details": `${EGYPTIAN.wallet} ${EGYPTIAN.advanced}`,
  "Wallet technical details": `${EGYPTIAN.wallet} ${EGYPTIAN.advanced}`,
  "Wallet status": `${EGYPTIAN.wallet} ${EGYPTIAN.active}`,
  "Create wallet": `${EGYPTIAN.create} ${EGYPTIAN.wallet}`,
  "Add another wallet": `${EGYPTIAN.create} ${EGYPTIAN.wallet}`,
  "Restore wallet": `${EGYPTIAN.restore} ${EGYPTIAN.wallet}`,
  "Restore from recovery phrase": EGYPTIAN.restore,
  "Generate recovery phrase": EGYPTIAN.create,
  "Recovery Phrase": EGYPTIAN.save,
  "Recovery phrase": EGYPTIAN.save,
  "Save identity": `${EGYPTIAN.save} ${EGYPTIAN.name}`,
  "Save wallet": `${EGYPTIAN.save} ${EGYPTIAN.wallet}`,
  Saved: EGYPTIAN.save,
  Save: EGYPTIAN.save,
  "Back up recovery phrase": EGYPTIAN.save,
  "Copy phrase": EGYPTIAN.copy,
  "Secure backup": `${EGYPTIAN.private} ${EGYPTIAN.save}`,
  Create: EGYPTIAN.create,
  Restore: EGYPTIAN.restore,
  Review: EGYPTIAN.explore,
  Back: EGYPTIAN.restore,
  Next: EGYPTIAN.send,
  Close: EGYPTIAN.close,
  "Close navigation": `${EGYPTIAN.close} ${EGYPTIAN.open}`,
  Copy: EGYPTIAN.copy,
  "Copy address": EGYPTIAN.copy,
  Share: EGYPTIAN.share,
  "Share QR": `${EGYPTIAN.share} QR`,
  Reset: EGYPTIAN.restore,
  "Reset to default": EGYPTIAN.restore,
  Refresh: EGYPTIAN.restore,
  "Check & Save": `${EGYPTIAN.explore} · ${EGYPTIAN.save}`,
  "Save without checking": EGYPTIAN.save,
  Approve: EGYPTIAN.save,
  Reject: EGYPTIAN.close,
  Active: EGYPTIAN.active,
  Ready: EGYPTIAN.ready,
  Unavailable: EGYPTIAN.error,
  "Action failed.": EGYPTIAN.error,
  "Transaction failed.": EGYPTIAN.error,
  "Loading…": `${EGYPTIAN.stats}…`,
  "Refreshing…": `${EGYPTIAN.restore}…`,
  Search: EGYPTIAN.search,
  Balance: EGYPTIAN.balance,
  Balances: EGYPTIAN.balance,
  "Available balance": EGYPTIAN.balance,
  "Standard balance": EGYPTIAN.balance,
  "Private balance": `${EGYPTIAN.private} ${EGYPTIAN.balance}`,
  "Create private balance": `${EGYPTIAN.create} ${EGYPTIAN.private} ${EGYPTIAN.balance}`,
  "Move to private balance": `${EGYPTIAN.send} ${EGYPTIAN.private} ${EGYPTIAN.balance}`,
  "Latest Transactions": `${EGYPTIAN.active} ${EGYPTIAN.send}`,
  "No transfers recorded yet.": EGYPTIAN.send,
  Amount: EGYPTIAN.money,
  Asset: EGYPTIAN.money,
  "Asset ID": EGYPTIAN.money,
  Recipient: EGYPTIAN.account,
  From: EGYPTIAN.account,
  To: EGYPTIAN.account,
  Standard: EGYPTIAN.balance,
  Private: EGYPTIAN.private,
  "Send mode": EGYPTIAN.send,
  "Send privately": `${EGYPTIAN.send} ${EGYPTIAN.private}`,
  "Payment details": `${EGYPTIAN.money} ${EGYPTIAN.advanced}`,
  "Private address": `${EGYPTIAN.private} ${EGYPTIAN.account}`,
  "Scan payment QR": `${EGYPTIAN.explore} QR`,
  "Upload QR image": `${EGYPTIAN.receive} QR`,
  "Show a fresh QR for this wallet.": `${EGYPTIAN.wallet} QR`,
  "QR ready.": `${EGYPTIAN.ready} QR`,
  "QR shared.": `${EGYPTIAN.share} QR`,
  "QR decoded successfully.": `${EGYPTIAN.ready} QR`,
  "QR payload is invalid.": `${EGYPTIAN.error} QR`,
  "Current endpoint": EGYPTIAN.bridge,
  "Default endpoint": EGYPTIAN.bridge,
  "Custom endpoint": EGYPTIAN.bridge,
  Endpoint: EGYPTIAN.bridge,
  "Torii endpoint": `Torii · ${EGYPTIAN.bridge}`,
  "Check health": `${EGYPTIAN.explore} ${EGYPTIAN.active}`,
  "Network ready": `${EGYPTIAN.bridge} ${EGYPTIAN.ready}`,
  "Stake Token Balance": `${EGYPTIAN.stake} ${EGYPTIAN.balance}`,
  "Available to stake": `${EGYPTIAN.balance} ${EGYPTIAN.stake}`,
  "Staking position": `${EGYPTIAN.stake} ${EGYPTIAN.workspace}`,
  Vote: EGYPTIAN.council,
  Aye: EGYPTIAN.save,
  Nay: EGYPTIAN.close,
  Abstain: EGYPTIAN.offline,
  Citizenship: EGYPTIAN.council,
  "Not a citizen yet": `${EGYPTIAN.council} · ${EGYPTIAN.error}`,
  "Bond citizenship to vote": `${EGYPTIAN.stake} ${EGYPTIAN.council}`,
  "Request XOR": `${EGYPTIAN.receive} XOR`,
  "Service status": `${EGYPTIAN.services} ${EGYPTIAN.active}`,
} satisfies Readonly<Record<string, string>>;

export const OLD_AKKADIAN_TRANSLATIONS = {
  Navigate: AKKADIAN.open,
  Daily: AKKADIAN.daily,
  Grow: AKKADIAN.stake,
  Services: AKKADIAN.services,
  Settings: AKKADIAN.settings,
  "Endpoint and app preferences": AKKADIAN.settings,
  Advanced: AKKADIAN.settings,
  "Advanced settings": AKKADIAN.settings,
  "Network and developer settings": `${AKKADIAN.network} ${AKKADIAN.settings}`,
  "Saved Wallets": `${AKKADIAN.save} ${AKKADIAN.wallet}`,
  "Create, restore, or switch wallets": `${AKKADIAN.create} · ${AKKADIAN.restore} · ${AKKADIAN.network} ${AKKADIAN.wallet}`,
  Wallet: AKKADIAN.wallet,
  "Iroha Wallet": `Iroha ${AKKADIAN.wallet}`,
  "Open wallet": `${AKKADIAN.open} ${AKKADIAN.wallet}`,
  "Balance, funding, and activity": `${AKKADIAN.balance} · ${AKKADIAN.wallet} · ${AKKADIAN.active}`,
  Send: AKKADIAN.send,
  "Pay with a QR or account": `${AKKADIAN.send} · QR · ${AKKADIAN.account}`,
  Receive: AKKADIAN.receive,
  "Show a payment QR": `${AKKADIAN.receive} · QR`,
  Staking: AKKADIAN.stake,
  "Stake XOR": `${AKKADIAN.stake} XOR`,
  "Choose a validator and manage stake": `${AKKADIAN.stake} · ${AKKADIAN.settings}`,
  Governance: AKKADIAN.council,
  "Bond citizenship and vote in governance referenda": `${AKKADIAN.stake} ${AKKADIAN.council}`,
  "Citizenship, referenda, ballots, and council status": AKKADIAN.council,
  Subscriptions: AKKADIAN.subscriptions,
  "Recurring payments": AKKADIAN.subscriptions,
  Stats: AKKADIAN.stats,
  "Network health": `${AKKADIAN.network} ${AKKADIAN.active}`,
  "Supply, activity, and explorer signals": `${AKKADIAN.total} · ${AKKADIAN.active} · ${AKKADIAN.explore}`,
  Explore: AKKADIAN.explore,
  Explorer: AKKADIAN.explore,
  "Explorer QR and network status": `${AKKADIAN.explore} · QR · ${AKKADIAN.network}`,
  SoraCloud: "SoraCloud",
  "Launch and monitor live services": `${AKKADIAN.active} ${AKKADIAN.services}`,
  VPN: `VPN · ${AKKADIAN.network}`,
  "Sora VPN": `Sora VPN · ${AKKADIAN.network}`,
  "Private network connection": AKKADIAN.network,
  Kaigi: "Kaigi",
  "Wallet-based meeting links": `${AKKADIAN.wallet} · ${AKKADIAN.council} · ${AKKADIAN.network}`,
  Offline: AKKADIAN.offline,
  "Device payments and invoices": `${AKKADIAN.offline} ${AKKADIAN.wallet}`,
  "SCCP Bridge": `SCCP ${AKKADIAN.bridge}`,
  "TAIRA, TRON, and BSC XOR bridge": `TAIRA · TRON · BSC · XOR · ${AKKADIAN.bridge}`,
  Network: AKKADIAN.network,
  Connection: AKKADIAN.network,
  Language: AKKADIAN.language,
  "Switch to light": AKKADIAN.light,
  "Switch to dark": AKKADIAN.dark,
  Account: AKKADIAN.account,
  "Active account": `${AKKADIAN.active} ${AKKADIAN.account}`,
  "No active wallet": AKKADIAN.wallet,
  "Select account": AKKADIAN.account,
  "Wallet name": AKKADIAN.account,
  "Wallet identity": `${AKKADIAN.wallet} ${AKKADIAN.account}`,
  "Wallet details": `${AKKADIAN.wallet} ${AKKADIAN.account}`,
  "Wallet technical details": `${AKKADIAN.wallet} ${AKKADIAN.account}`,
  "Wallet status": `${AKKADIAN.wallet} ${AKKADIAN.active}`,
  "Create wallet": `${AKKADIAN.create} ${AKKADIAN.wallet}`,
  "Add another wallet": `${AKKADIAN.create} ${AKKADIAN.wallet}`,
  "Restore wallet": `${AKKADIAN.restore} ${AKKADIAN.wallet}`,
  "Restore from recovery phrase": AKKADIAN.restore,
  "Generate recovery phrase": AKKADIAN.create,
  "Recovery Phrase": AKKADIAN.save,
  "Recovery phrase": AKKADIAN.save,
  "Save identity": `${AKKADIAN.save} ${AKKADIAN.account}`,
  "Save wallet": `${AKKADIAN.save} ${AKKADIAN.wallet}`,
  Saved: AKKADIAN.save,
  Save: AKKADIAN.save,
  "Back up recovery phrase": AKKADIAN.save,
  "Copy phrase": AKKADIAN.copy,
  "Secure backup": AKKADIAN.save,
  Create: AKKADIAN.create,
  Restore: AKKADIAN.restore,
  Review: AKKADIAN.explore,
  Back: AKKADIAN.restore,
  Next: AKKADIAN.send,
  Close: AKKADIAN.close,
  "Close navigation": `${AKKADIAN.close} ${AKKADIAN.open}`,
  Copy: AKKADIAN.copy,
  "Copy address": AKKADIAN.copy,
  Share: AKKADIAN.share,
  "Share QR": `${AKKADIAN.share} QR`,
  Reset: AKKADIAN.restore,
  "Reset to default": AKKADIAN.restore,
  Refresh: AKKADIAN.restore,
  "Check & Save": `${AKKADIAN.explore} · ${AKKADIAN.save}`,
  "Save without checking": AKKADIAN.save,
  Approve: AKKADIAN.save,
  Reject: AKKADIAN.close,
  Active: AKKADIAN.active,
  Ready: AKKADIAN.ready,
  Unavailable: AKKADIAN.error,
  "Action failed.": AKKADIAN.error,
  "Transaction failed.": AKKADIAN.error,
  "Loading…": `${AKKADIAN.stats}…`,
  "Refreshing…": `${AKKADIAN.restore}…`,
  Search: AKKADIAN.explore,
  Balance: AKKADIAN.balance,
  Balances: AKKADIAN.balance,
  "Available balance": AKKADIAN.balance,
  "Standard balance": AKKADIAN.balance,
  "Private balance": AKKADIAN.balance,
  "Create private balance": `${AKKADIAN.create} ${AKKADIAN.balance}`,
  "Move to private balance": `${AKKADIAN.send} ${AKKADIAN.balance}`,
  "Latest Transactions": `${AKKADIAN.active} ${AKKADIAN.send}`,
  "No transfers recorded yet.": AKKADIAN.send,
  Amount: AKKADIAN.wallet,
  Asset: AKKADIAN.wallet,
  "Asset ID": AKKADIAN.account,
  Recipient: AKKADIAN.account,
  From: AKKADIAN.account,
  To: AKKADIAN.account,
  Standard: AKKADIAN.balance,
  Private: AKKADIAN.close,
  "Send mode": AKKADIAN.send,
  "Send privately": AKKADIAN.send,
  "Payment details": `${AKKADIAN.wallet} ${AKKADIAN.account}`,
  "Private address": AKKADIAN.account,
  "Scan payment QR": `${AKKADIAN.explore} QR`,
  "Upload QR image": `${AKKADIAN.receive} QR`,
  "Show a fresh QR for this wallet.": `${AKKADIAN.wallet} QR`,
  "QR ready.": `${AKKADIAN.ready} QR`,
  "QR shared.": `${AKKADIAN.share} QR`,
  "QR decoded successfully.": `${AKKADIAN.ready} QR`,
  "QR payload is invalid.": `${AKKADIAN.error} QR`,
  "Current endpoint": AKKADIAN.network,
  "Default endpoint": AKKADIAN.network,
  "Custom endpoint": AKKADIAN.network,
  Endpoint: AKKADIAN.network,
  "Torii endpoint": `Torii · ${AKKADIAN.network}`,
  "Check health": `${AKKADIAN.explore} ${AKKADIAN.active}`,
  "Network ready": `${AKKADIAN.network} ${AKKADIAN.ready}`,
  "Stake Token Balance": `${AKKADIAN.stake} ${AKKADIAN.balance}`,
  "Available to stake": `${AKKADIAN.balance} ${AKKADIAN.stake}`,
  "Staking position": `${AKKADIAN.stake} ${AKKADIAN.workspace}`,
  Vote: AKKADIAN.council,
  Aye: AKKADIAN.save,
  Nay: AKKADIAN.close,
  Abstain: AKKADIAN.offline,
  Citizenship: AKKADIAN.council,
  "Not a citizen yet": `${AKKADIAN.error} ${AKKADIAN.council}`,
  "Bond citizenship to vote": `${AKKADIAN.stake} ${AKKADIAN.council}`,
  "Request XOR": `${AKKADIAN.receive} XOR`,
  "Service status": `${AKKADIAN.services} ${AKKADIAN.active}`,
} satisfies Readonly<Record<string, string>>;

export const EGYPTIAN_QUIET_SAKURA_TRANSLATIONS = {
  "Active subscriptions": `${EGYPTIAN.active} ${EGYPTIAN.subscriptions}`,
  "Camera preview": EGYPTIAN.explore,
  "Choose a destination": `${EGYPTIAN.search} ${EGYPTIAN.workspace}`,
  "Close navigation": `${EGYPTIAN.close} ${EGYPTIAN.open}`,
  "Create, restore, or switch wallets": `${EGYPTIAN.create} · ${EGYPTIAN.restore} · ${EGYPTIAN.bridge} ${EGYPTIAN.wallet}`,
  "Loading subscriptions…": `${EGYPTIAN.subscriptions}…`,
  "Meeting link": `${EGYPTIAN.bridge} ${EGYPTIAN.meeting}`,
  "No subscriptions yet": `${EGYPTIAN.subscriptions} · ${EGYPTIAN.error}`,
  "Preview appears here": `${EGYPTIAN.explore} ${EGYPTIAN.workspace}`,
  "Reading live plans and wallet records.": `${EGYPTIAN.stats} ${EGYPTIAN.active} ${EGYPTIAN.account}`,
  "Service status": `${EGYPTIAN.services} ${EGYPTIAN.active}`,
  "SoraCloud workspace": `SoraCloud ${EGYPTIAN.workspace}`,
  "Staking position": `${EGYPTIAN.stake} ${EGYPTIAN.workspace}`,
  "Subscription workspace": `${EGYPTIAN.subscriptions} ${EGYPTIAN.workspace}`,
  "Wallet technical details": `${EGYPTIAN.wallet} ${EGYPTIAN.advanced}`,
} as const;

export const OLD_AKKADIAN_QUIET_SAKURA_TRANSLATIONS = {
  "Active subscriptions": `${AKKADIAN.active} ${AKKADIAN.subscriptions}`,
  "Camera preview": AKKADIAN.explore,
  "Choose a destination": `${AKKADIAN.explore} ${AKKADIAN.workspace}`,
  "Close navigation": `${AKKADIAN.close} ${AKKADIAN.open}`,
  "Create, restore, or switch wallets": `${AKKADIAN.create} · ${AKKADIAN.restore} · ${AKKADIAN.network} ${AKKADIAN.wallet}`,
  "Loading subscriptions…": `${AKKADIAN.subscriptions}…`,
  "Meeting link": `${AKKADIAN.network} ${AKKADIAN.council}`,
  "No subscriptions yet": `${AKKADIAN.error} ${AKKADIAN.subscriptions}`,
  "Preview appears here": `${AKKADIAN.explore} ${AKKADIAN.workspace}`,
  "Reading live plans and wallet records.": `${AKKADIAN.stats} ${AKKADIAN.active} ${AKKADIAN.account}`,
  "Service status": `${AKKADIAN.services} ${AKKADIAN.active}`,
  "SoraCloud workspace": `SoraCloud ${AKKADIAN.workspace}`,
  "Staking position": `${AKKADIAN.stake} ${AKKADIAN.workspace}`,
  "Subscription workspace": `${AKKADIAN.subscriptions} ${AKKADIAN.workspace}`,
  "Wallet technical details": `${AKKADIAN.wallet} ${AKKADIAN.account}`,
} as const;
