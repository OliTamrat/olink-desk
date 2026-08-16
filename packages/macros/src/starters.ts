// Starter macros — the three replies every desk sends on day one.
//
// A macros page that opens empty teaches nothing: an agent cannot tell what a
// macro is FOR from a blank list, and an admin does not know a body can be
// written in six languages until they see one that is. So a workspace gets
// three on first visit, seeded lazily the way SLA policies are.
//
// They are deliberately generic — no product, no policy, no promise a real
// business has not made — and they are ordinary rows an admin can edit or
// delete. Nothing in the product treats a starter differently from a macro
// the team wrote.
//
// Language status, stated plainly rather than implied: EN and AM are
// composed; OM/TI/SO/SW are drafts written against Bank Assist's reviewed
// sentence patterns and carried into the linguist review sheet like every
// other string in the fleet. A macro is customer-facing prose sent verbatim,
// so these matter more than console chrome — see the Bank Assist curated-
// answers note on why verbatim content raises the bar for review.

import type { MacroBodies } from "./render";

export interface StarterMacro {
  title: string;
  category: string;
  setStatus: "OPEN" | "PENDING" | "RESOLVED" | null;
  bodies: MacroBodies;
}

export const STARTER_MACROS: StarterMacro[] = [
  {
    title: "Ask for more detail",
    category: "General",
    // The customer now owes us something, so the ticket is waiting on them.
    setStatus: "PENDING",
    bodies: {
      en:
        "Hello {{customer.name}},\n\n" +
        "Thanks for contacting {{organization.name}}. So that we can help quickly, " +
        "could you send us a little more detail about what happened?\n\n" +
        "{{agent.name}}",
      am:
        "ሰላም {{customer.name}}፣\n\n" +
        "{{organization.name}}ን ስላገኙን እናመሰግናለን። በፍጥነት ልንረዳዎት እንድንችል፣ " +
        "ስለተፈጠረው ነገር ትንሽ ተጨማሪ መረጃ ቢልኩልን።\n\n" +
        "{{agent.name}}",
      om:
        "Akkam {{customer.name}},\n\n" +
        "{{organization.name}} qunnamuu keessaniif galatoomaa. Dafnee akka isin " +
        "gargaaruu dandeenyuuf, waa'ee waan uumamee odeeffannoo xiqqoo dabalataa " +
        "nuuf ergaa.\n\n" +
        "{{agent.name}}",
      ti:
        "ሰላም {{customer.name}}፣\n\n" +
        "ንዓና ስለ ዘዘራረብኩም {{organization.name}} የመስግነኩም። ብቕልጡፍ ክንሕግዘኩም ምእንቲ፡ " +
        "ብዛዕባ እቲ ዘጋጠመ ቁሩብ ተወሳኺ ሓበሬታ ስደዱልና።\n\n" +
        "{{agent.name}}",
      so:
        "Salaan {{customer.name}},\n\n" +
        "Waad ku mahadsan tahay inaad nala soo xiriirtay {{organization.name}}. Si " +
        "aan si degdeg ah kuugu caawinno, fadlan noo soo dir faahfaahin yar oo " +
        "dheeraad ah oo ku saabsan wixii dhacay.\n\n" +
        "{{agent.name}}",
      sw:
        "Habari {{customer.name}},\n\n" +
        "Asante kwa kuwasiliana na {{organization.name}}. Ili tuweze kukusaidia " +
        "haraka, tafadhali tutumie maelezo zaidi kuhusu kilichotokea.\n\n" +
        "{{agent.name}}",
    },
  },
  {
    title: "We are looking into it",
    category: "General",
    setStatus: "OPEN",
    bodies: {
      en:
        "Hello {{customer.name}},\n\n" +
        "We have your request {{ticket.number}} and we are looking into it now. " +
        "We will write back here as soon as we have an answer.\n\n" +
        "{{agent.name}}",
      am:
        "ሰላም {{customer.name}}፣\n\n" +
        "ጥያቄዎ {{ticket.number}} ደርሶናል፤ አሁን እየተመለከትነው ነው። መልስ እንዳገኘን " +
        "ወዲያውኑ እዚሁ እንጽፍልዎታለን።\n\n" +
        "{{agent.name}}",
      om:
        "Akkam {{customer.name}},\n\n" +
        "Gaaffiin keessan {{ticket.number}} nu ga'eera; amma ilaalaa jirra. Deebii " +
        "yeroo argannu, achuma kanatti isinii barreessina.\n\n" +
        "{{agent.name}}",
      ti:
        "ሰላም {{customer.name}}፣\n\n" +
        "ሕቶኹም {{ticket.number}} በጺሑና፡ ሕጂ ንርእዮ ኣለና። መልሲ ምስ ረኸብና ኣብዚ " +
        "ክንጽሕፈልኩም ኢና።\n\n" +
        "{{agent.name}}",
      so:
        "Salaan {{customer.name}},\n\n" +
        "Codsigaaga {{ticket.number}} waa na soo gaadhay, waanan eegaynaa hadda. " +
        "Marka aan jawaab helno, halkan ayaan kaaga soo qori doonaa.\n\n" +
        "{{agent.name}}",
      sw:
        "Habari {{customer.name}},\n\n" +
        "Ombi lako {{ticket.number}} limetufikia, na tunalishughulikia sasa. " +
        "Tutakuandikia hapa mara tu tutakapopata jibu.\n\n" +
        "{{agent.name}}",
    },
  },
  {
    title: "Resolved — confirm with the customer",
    category: "Closing",
    setStatus: "RESOLVED",
    bodies: {
      en:
        "Hello {{customer.name}},\n\n" +
        "Your request {{ticket.number}} is now resolved. If anything is still not " +
        "right, just reply here and we will reopen it.\n\n" +
        "{{agent.name}}",
      am:
        "ሰላም {{customer.name}}፣\n\n" +
        "ጥያቄዎ {{ticket.number}} ተፈትቷል። አሁንም የቀረ ነገር ካለ እዚሁ መልስ ይስጡን፤ " +
        "እንደገና እንከፍተዋለን።\n\n" +
        "{{agent.name}}",
      om:
        "Akkam {{customer.name}},\n\n" +
        "Gaaffiin keessan {{ticket.number}} furameera. Wanti hafe yoo jiraate, " +
        "asuma irratti deebii nuuf kennaa; irra deebi'nee ni banna.\n\n" +
        "{{agent.name}}",
      ti:
        "ሰላም {{customer.name}}፣\n\n" +
        "ሕቶኹም {{ticket.number}} ተፈቲሑ ኣሎ። ገና ዘይተወደአ ነገር እንተሎ፡ ኣብዚ መልሲ ሃቡና፡ " +
        "ብሓድሽ ክንከፍቶ ኢና።\n\n" +
        "{{agent.name}}",
      so:
        "Salaan {{customer.name}},\n\n" +
        "Codsigaaga {{ticket.number}} waa la xalliyay. Haddii wax weli qaldan " +
        "yihiin, halkan ka jawaab, waanan dib u furi doonaa.\n\n" +
        "{{agent.name}}",
      sw:
        "Habari {{customer.name}},\n\n" +
        "Ombi lako {{ticket.number}} limetatuliwa. Kama kuna jambo bado " +
        "halijakaa sawa, jibu hapa nasi tutalifungua tena.\n\n" +
        "{{agent.name}}",
    },
  },
];
