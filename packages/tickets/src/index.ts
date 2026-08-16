export { normalizePhone, displayPhone, MAX_PHONE_LENGTH } from "./phone";
export { openTicket, type OpenTicketInput } from "./open";
export {
  cleanContact,
  ContactConflictError,
  findOrCreateContact,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  type CleanContact,
  type ContactInput,
} from "./contacts";
export {
  closeTab,
  MAX_OPEN_TABS,
  nextAfterClose,
  openTab,
  type OpenTab,
} from "./open-tabs";
export {
  AA_NON_TEXT,
  AA_TEXT,
  contrast,
  luminance,
  parseHex,
} from "./contrast";
