// Function words in all six languages Desk serves.
//
// This list is a SAFETY mechanism, not an optimisation. The informativeness
// gate in `retrieve()` measures what fraction of a question's *content* words
// matched — so anything wrongly counted as a content word raises the bar a
// question has to clear.
//
// Ported with the Bank Assist finding that motivated it: the list there was
// English-only, so an Amharic question's function words all counted as
// content, and Amharic was held to roughly three times the bar of English for
// the same question. A stopword list that covers one language is worse than
// none, because the damage is invisible and falls entirely on the languages
// nobody tested.

const EN = [
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "at",
  "for", "with", "is", "are", "was", "were", "be", "been", "am", "do", "does",
  "did", "have", "has", "had", "i", "you", "he", "she", "it", "we", "they",
  "my", "your", "his", "her", "its", "our", "their", "me", "him", "them",
  "this", "that", "these", "those", "there", "here", "how", "what", "when",
  "where", "why", "who", "which", "can", "could", "will", "would", "should",
  "may", "might", "must", "not", "no", "yes", "please", "thanks", "thank",
  "hello", "hi", "hey", "so", "very", "just", "some", "any", "from", "by",
  "about", "as", "up", "out", "get", "got", "want", "need",
];

const AM = [
  "እና", "ወይም", "ግን", "ከሆነ", "የ", "ለ", "በ", "ወደ", "ላይ", "ውስጥ", "ነው", "ናቸው",
  "ነበር", "አለ", "የለም", "እኔ", "አንተ", "አንቺ", "እሱ", "እሷ", "እኛ", "እነሱ", "የኔ",
  "የእርስዎ", "ይህ", "ያ", "እንዴት", "ምን", "መቼ", "የት", "ለምን", "ማን", "ይችላል",
  "አይደለም", "አዎ", "እባክዎ", "አመሰግናለሁ", "ሰላም", "ጋር", "ስለ", "እባክህ", "እባክሽ",
];

const OM = [
  "fi", "yookaan", "garuu", "yoo", "kan", "irratti", "keessa", "gara", "waliin",
  "ta'e", "jira", "hin", "ani", "ati", "inni", "isheen", "nuti", "isaan", "koo",
  "keessan", "kun", "sun", "akkamitti", "maal", "yoom", "eessa", "maaliif",
  "eenyu", "danda'a", "eeyyee", "maaloo", "galatoomi", "akkam", "waa'ee",
];

const TI = [
  "ን", "እሞ", "ግን", "እንተ", "ናይ", "ኣብ", "ናብ", "ምስ", "እዩ", "እዮም", "ነበረ", "የለን",
  "ኣነ", "ንስኻ", "ንስኺ", "ንሱ", "ንሳ", "ንሕና", "ንሳቶም", "ናተይ", "ናትኩም", "እዚ", "እቲ",
  "ከመይ", "እንታይ", "መዓስ", "ኣበይ", "ስለምንታይ", "መን", "ይኽእል", "እወ", "በጃኹም",
  "የመስግን", "ሰላም", "ብዛዕባ",
];

const SO = [
  "iyo", "ama", "laakiin", "haddii", "ee", "ku", "ka", "la", "u", "waa",
  "ayaa", "baa", "aniga", "adiga", "isaga", "iyada", "annaga", "iyaga",
  "kayga", "kaaga", "kan", "kaas", "sidee", "maxay", "goorma", "xagee",
  "maxaa", "yaa", "kara", "haa", "maya", "fadlan", "mahadsanid", "salaan",
  "saabsan", "waxaan", "waxa",
];

const SW = [
  "na", "au", "lakini", "kama", "ya", "wa", "kwa", "katika", "ni", "si",
  "mimi", "wewe", "yeye", "sisi", "wao", "yangu", "yako", "hii", "hiyo",
  "vipi", "nini", "lini", "wapi", "kwanini", "nani", "naweza", "ndiyo",
  "hapana", "tafadhali", "asante", "habari", "kuhusu", "hii", "hizo",
];

/** One frozen set, merged. Six languages arrive in one message often enough
 *  in Ethiopia that keeping them separate would need language detection
 *  before tokenising — and a wrong detection would then silently change the
 *  bar. Merging costs a few false stopwords and removes that whole class. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  ...EN,
  ...AM,
  ...OM,
  ...TI,
  ...SO,
  ...SW,
]);

export const STOPWORDS_BY_LANGUAGE: Readonly<Record<string, readonly string[]>> = {
  en: EN,
  am: AM,
  om: OM,
  ti: TI,
  so: SO,
  sw: SW,
};
