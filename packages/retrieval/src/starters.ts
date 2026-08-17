// Starter knowledge-base articles.
//
// A knowledge base that opens empty teaches nothing. "No articles yet" is
// true and useless: it does not show that an article carries a title AND a
// body in six languages, that publishing is a separate decision from writing,
// or that the deflection counter is the number worth watching. One glance at
// four real rows says all three.
//
// Same discipline as STARTER_MACROS, and for a stronger reason: an article is
// shown to CUSTOMERS. So these are deliberately generic — no opening hours, no
// response time, no policy, no promise a real business has not made. Every one
// answers a question about how the desk itself works, which is true of every
// desk, and every one is an ordinary row an admin can rewrite or delete.
//
// **They arrive UNPUBLISHED.** Seeding published articles would put words in
// front of a bank's customers that nobody at that bank has read. The admin
// publishes them, and that click is the review.
//
// Language status, stated rather than implied: EN and AM are composed; OM, TI,
// SO and SW are drafts written against the same sentence patterns as the
// starter macros and carried into the linguist review sheet.

export interface StarterArticle {
  titles: Record<string, string>;
  bodies: Record<string, string>;
}

export const STARTER_ARTICLES: StarterArticle[] = [
  {
    titles: {
      en: "How do I get help?",
      am: "እንዴት እርዳታ ማግኘት እችላለሁ?",
      om: "Akkamittan gargaarsa argachuu danda'a?",
      ti: "ከመይ ሓገዝ ክረክብ እኽእል?",
      so: "Sidee caawimaad u heli karaa?",
      sw: "Nawezaje kupata msaada?",
    },
    bodies: {
      en:
        "Send us a message on whichever channel is easiest for you. Every message reaches the same team and becomes a ticket with its own number, so nothing is lost and nobody has to explain themselves twice.\n\n" +
        "You will get that ticket number in our first reply. Quote it if you contact us again about the same thing.",
      am:
        "ለእርስዎ በሚመችዎት በማንኛውም መንገድ መልእክት ይላኩልን። እያንዳንዱ መልእክት ወደ ተመሳሳይ ቡድን ይደርሳል፤ የራሱ ቁጥር ያለው ቲኬትም ይሆናል፤ ስለዚህ ምንም አይጠፋም፤ ማንም ሁለት ጊዜ ማብራራት አያስፈልገውም።\n\n" +
        "ያንን የቲኬት ቁጥር በመጀመሪያ መልሳችን ውስጥ ያገኛሉ። ስለ ተመሳሳይ ጉዳይ እንደገና ሲያገኙን ይጥቀሱት።",
      om:
        "Karaa siif salphaa ta'e kamiinuu ergaa nuuf ergi. Ergaan hundi garee tokkuma bira ga'a; tikeetii lakkoofsa mataa isaa qabu ta'a, kanaafuu wanti tokko hin badu, namni tokkos si'a lama ibsuu hin qabu.\n\n" +
        "Lakkoofsa tikeetii sana deebii keenya jalqabaa keessatti argatta. Waa'ee dhimma sanaa irra deebitee yoo nu qunnamte caqasi.",
      ti:
        "ብዝኾነ ንዓኻ ቀሊል ዝኾነ መንገዲ መልእኽቲ ስደደልና። ኩሉ መልእኽቲ ናብ ሓደ ጋንታ እዩ ዝበጽሕ፤ ናይ ገዛእ ርእሱ ቁጽሪ ዘለዎ ትኬት ይኸውን፤ ስለዚ ዝጠፍእ የለን፡ ማንም ክልተ ግዜ ክገልጽ ኣየድልን።\n\n" +
        "ነቲ ቁጽሪ ትኬት ኣብ ቀዳማይ መልስና ክትረኽቦ ኢኻ። ብዛዕባ ተመሳሳሊ ጉዳይ ደጊምካ እንተ ተወከስካና ጥቐሶ።",
      so:
        "Noogu soo dir fariin kanaal kasta oo kuu fudud. Fariin walba waxay gaadhaa isla kooxdaas, waxayna noqonaysaa tikidh lambar u gaar ah leh, sidaas darteed waxba luma mana jiro qof laba jeer sharxaya.\n\n" +
        "Lambarka tikidhka waxaad ka heli doontaa jawaabtayada koowaad. Soo xigo haddaad mar kale nala soo xidhiidho arrin isku mid ah.",
      sw:
        "Tutumie ujumbe kwa njia yoyote iliyo rahisi kwako. Kila ujumbe unafika kwa timu ile ile na kuwa tiketi yenye namba yake, hivyo hakuna kinachopotea na hakuna anayehitaji kueleza mara mbili.\n\n" +
        "Utapata namba hiyo ya tiketi katika jibu letu la kwanza. Itaje ukiwasiliana nasi tena kuhusu jambo lilelile.",
    },
  },
  {
    titles: {
      en: "What happens after I send a message?",
      am: "መልእክት ከላክሁ በኋላ ምን ይሆናል?",
      om: "Erga ergaa ergee booda maaltu ta'a?",
      ti: "መልእኽቲ ድሕሪ ምስዳደይ እንታይ የጋጥም?",
      so: "Maxaa dhacaya markaan fariin diro?",
      sw: "Nini hutokea baada ya kutuma ujumbe?",
    },
    bodies: {
      en:
        "Your message opens a ticket and is assigned to someone on the team. You will get a reply on the same channel you wrote from, in the language you wrote in.\n\n" +
        "If your question needs someone else to look at it, the ticket moves to them and stays open until it is answered. It is never closed just because it is old.",
      am:
        "መልእክትዎ ቲኬት ይከፍታል፤ ለቡድኑ አባልም ይሰጣል። በጻፉበት መንገድ፣ በጻፉበት ቋንቋ መልስ ያገኛሉ።\n\n" +
        "ጥያቄዎ ሌላ ሰው እንዲመለከተው የሚያስፈልግ ከሆነ ቲኬቱ ወደ እሱ ይተላለፋል፤ እስኪመለስም ክፍት ሆኖ ይቆያል። ስላረጀ ብቻ ፈጽሞ አይዘጋም።",
      om:
        "Ergaan kee tikeetii bana; nama garee keessaa tokkoofis kennama. Karaa itti barreessiteen, afaan itti barreessiteen deebii ni argatta.\n\n" +
        "Gaaffiin kee namni biraa akka ilaalu yoo barbaachise, tikeetichi gara isaa deema; hanga deebii argatutti banaa ta'ee tura. Waan dulloomeef qofa gonkumaa hin cufamu.",
      ti:
        "መልእኽትኻ ትኬት ይኸፍት፡ ንሓደ ኣባል ጋንታ ድማ ይወሃብ። በቲ ዝጸሓፍካሉ መንገዲ፡ በቲ ዝጸሓፍካሉ ቋንቋ መልሲ ክትረክብ ኢኻ።\n\n" +
        "ሕቶኻ ካልእ ሰብ ክርእዮ እንተ ኣድልዩ፡ እቲ ትኬት ናብኡ ይኸይድ፡ ክሳብ ዝምለስ ድማ ክፉት ኮይኑ ይጸንሕ። ስለ ዝኣረገ ጥራይ ፈጺሙ ኣይዕጾን።",
      so:
        "Fariintaadu waxay furaysaa tikidh, waxaana loo xilsaaraa qof kooxda ka tirsan. Jawaab waxaad ka heli doontaa kanaalkii aad ka qortay, luqaddii aad ku qortayna.\n\n" +
        "Haddii su'aashaadu u baahato in qof kale eego, tikidhku wuu u gudbayaa, wuxuuna furan yahay ilaa laga jawaabo. Waligeed lama xidho iyada oo kaliya ay duugoobtay.",
      sw:
        "Ujumbe wako unafungua tiketi na kukabidhiwa mtu katika timu. Utapata jibu kwa njia ile ile uliyoandikia, kwa lugha uliyotumia.\n\n" +
        "Kama swali lako linahitaji mtu mwingine kuliangalia, tiketi inahamia kwake na inabaki wazi hadi ijibiwe. Haifungwi kamwe kwa sababu tu imekaa muda mrefu.",
    },
  },
  {
    titles: {
      en: "How do I check on a request I already sent?",
      am: "ቀደም የላክሁትን ጥያቄ እንዴት እከታተላለሁ?",
      om: "Gaaffii duraan ergee akkamittan hordofa?",
      ti: "ቀደም ዝሰደድክዎ ሕቶ ከመይ ክከታተሎ?",
      so: "Sidee u hubiyaa codsi aan horay u soo diray?",
      sw: "Nifuatiliaje ombi nililotuma awali?",
    },
    bodies: {
      en:
        "Reply to the same conversation and quote your ticket number. Your reply lands on the original ticket rather than starting a new one, so whoever picks it up can see everything that was said before.\n\n" +
        "Starting a fresh message about the same problem is not wrong — it just means the history is in two places.",
      am:
        "በተመሳሳይ ውይይት ውስጥ መልስ ይስጡ፤ የቲኬት ቁጥርዎንም ይጥቀሱ። መልስዎ አዲስ ቲኬት ከመክፈት ይልቅ በዋናው ቲኬት ላይ ይቀመጣል፤ ስለዚህ የሚያነሳው ሰው ከዚህ በፊት የተባለውን ሁሉ ማየት ይችላል።\n\n" +
        "ስለ ተመሳሳይ ችግር አዲስ መልእክት መጀመር ስህተት አይደለም — ታሪኩ በሁለት ቦታ እንዲሆን ብቻ ያደርገዋል።",
      om:
        "Marii isuma keessatti deebisi; lakkoofsa tikeetii keetis caqasi. Deebiin kee tikeetii duraanii irratti bu'a malee haaraa hin banu, kanaafuu namni fudhatu waan duraan jedhame hunda arguu danda'a.\n\n" +
        "Waa'ee rakkoo isuma sanaa ergaa haaraa jalqabuun dogoggora miti — seenaan sun bakka lamatti akka qoodamu qofa taasisa.",
      ti:
        "ኣብቲ ተመሳሳሊ ዝርርብ መልሲ ሃብ፡ ቁጽሪ ትኬትካውን ጥቐስ። መልስኻ ሓድሽ ትኬት ካብ ምኽፋት ኣብቲ ናይ መጀመርታ ትኬት እዩ ዝወድቕ፡ ስለዚ እቲ ዝርእዮ ሰብ ኩሉ ቅድሚ ሕጂ ዝተባህለ ክርኢ ይኽእል።\n\n" +
        "ብዛዕባ ተመሳሳሊ ጸገም ሓድሽ መልእኽቲ ምጅማር ጌጋ ኣይኮነን — ንታሪኹ ኣብ ክልተ ቦታ ጥራይ እዩ ዝገብሮ።",
      so:
        "Kaga jawaab isla wadahadalkii, oo soo xigo lambarkaaga tikidhka. Jawaabtaadu waxay ku dhacaysaa tikidhkii asalka ahaa halkii ay mid cusub furi lahayd, sidaas darteed qofka qaadanaya wuu arki karaa wixii hore loo yidhi.\n\n" +
        "Inaad fariin cusub ka bilowdo dhibaato isku mid ah khalad ma aha — waxay uun ka dhigaysaa in taariikhdu laba meel ku jirto.",
      sw:
        "Jibu katika mazungumzo yale yale na utaje namba yako ya tiketi. Jibu lako linaingia kwenye tiketi ya awali badala ya kuanzisha mpya, hivyo atakayeishughulikia anaona yote yaliyosemwa awali.\n\n" +
        "Kuanzisha ujumbe mpya kuhusu tatizo lile lile si kosa — inamaanisha tu historia iko sehemu mbili.",
    },
  },
  {
    titles: {
      en: "How do I change my phone number or email with you?",
      am: "የስልክ ቁጥሬን ወይም ኢሜይሌን እንዴት እቀይራለሁ?",
      om: "Lakkoofsa bilbilaa ykn imeelii koo akkamittan jijjiira?",
      ti: "ቁጽሪ ተሌፎነይ ወይ ኢመይለይ ከመይ ክቕይሮ?",
      so: "Sidee ku beddelaa lambarkayga taleefanka ama iimaylkayga?",
      sw: "Nibadilishaje namba yangu ya simu au barua pepe?",
    },
    bodies: {
      en:
        "Tell us the new details in a message and we will update your record. We may ask a question first to confirm it is really you — that check exists to stop somebody else changing where your messages go.\n\n" +
        "Once it is changed, replies go to the new address. Anything already sent to the old one stays where it was sent.",
      am:
        "አዲሱን መረጃ በመልእክት ይንገሩን፤ መዝገብዎን እናዘምናለን። በእርግጥ እርስዎ መሆንዎን ለማረጋገጥ አስቀድመን ጥያቄ ልንጠይቅ እንችላለን — ይህ ማረጋገጫ ሌላ ሰው መልእክቶችዎ የሚሄዱበትን እንዳይቀይር ነው።\n\n" +
        "ከተቀየረ በኋላ መልሶች ወደ አዲሱ አድራሻ ይሄዳሉ። ቀደም ሲል ወደ አሮጌው የተላከው በተላከበት ይቆያል።",
      om:
        "Odeeffannoo haaraa ergaadhaan nutti himi; galmee kee ni haaromsina. Dhugumatti ati ta'uu kee mirkaneessuuf duraan dursinee gaaffii gaafachuu dandeenya — hordoffiin kun namni biraa bakka ergaan kee dhaqu akka hin jijjiirre gargaara.\n\n" +
        "Erga jijjiirameen booda deebiin gara teessoo haaraa deema. Wanti duraan gara moofaatti ergame bakka ergametti hafa.",
      ti:
        "ነቲ ሓድሽ ሓበሬታ ብመልእኽቲ ንገረና፡ መዝገብካ ከነሐድሶ ኢና። ብሓቂ ንስኻ ምዃንካ ንምርግጋጽ ቅድሚኡ ሕቶ ክንሓትት ንኽእል ኢና — እዚ መረጋገጺ ካልእ ሰብ መልእኽትታትካ ዝኸደሉ ቦታ ንኸይቅይር እዩ።\n\n" +
        "ምስ ተቐየረ መልስታት ናብቲ ሓድሽ ኣድራሻ ይኸዱ። ቀደም ናብቲ ኣረጊት ዝተሰደደ ኣብቲ ዝተሰደደሉ ይጸንሕ።",
      so:
        "Noo sheeg macluumaadka cusub fariin, waana cusboonaysiin doonaa diiwaankaaga. Waxaa laga yaabaa inaan marka hore su'aal ku weydiino si aan u xaqiijino inaad dhab ahaan tahay adiga — hubintaasi waxay joojinaysaa in qof kale beddelo meesha fariimahaagu tagayaan.\n\n" +
        "Marka la beddelo, jawaabuhu waxay tagayaan cinwaanka cusub. Wixii horay loogu diray kii hore wuxuu ku hadhayaa meeshii loo diray.",
      sw:
        "Tuambie taarifa mpya kwa ujumbe nasi tutasasisha rekodi yako. Tunaweza kuuliza swali kwanza ili kuthibitisha ni wewe kweli — ukaguzi huo upo kuzuia mtu mwingine kubadilisha mahali ujumbe wako unapoenda.\n\n" +
        "Ikishabadilishwa, majibu yanaenda kwa anwani mpya. Kilichokwisha tumwa kwa ile ya zamani kinabaki kilikotumwa.",
    },
  },
];

/**
 * Seed the starter articles into a workspace that has none.
 *
 * Lazy and idempotent, the way `ensureStarterMacros` is: called on the first
 * read of the knowledge base rather than at registration, so a workspace
 * created before this existed gets them too, and a workspace that deleted them
 * on purpose never gets them back.
 */
export async function ensureStarterArticles(
  db: {
    kbArticle: {
      count(args: unknown): Promise<number>;
      createMany(args: unknown): Promise<unknown>;
    };
  },
  organizationId: string,
): Promise<void> {
  const existing = await db.kbArticle.count({ where: { organizationId } });
  if (existing > 0) return;
  await db.kbArticle.createMany({
    data: STARTER_ARTICLES.map((a) => ({
      organizationId,
      titles: a.titles,
      bodies: a.bodies,
      // Unpublished. Seeding published articles would put words in front of a
      // bank's customers that nobody at that bank has read; the admin's
      // publish click IS the review.
      isPublished: false,
    })),
    skipDuplicates: true,
  });
}
