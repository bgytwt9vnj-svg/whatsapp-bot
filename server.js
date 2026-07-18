require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const { findLeadByPhone, createLead, updateLead, getAllLeads } = require('./sheets');
const { detectSegment, maxStepFor, getStepContent, getDeltaHours } = require('./followups');

// רשת ביטחון - מונעת קריסה מלאה של השרת אם משהו נכשל בלי טיפול
process.on('uncaughtException', (err) => console.log('שגיאה לא מטופלת:', err));
process.on('unhandledRejection', (err) => console.log('דחייה לא מטופלת:', err));

const app = express();
const PORT = 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json());

// מחזירה תאריך ושעה נוכחיים בפורמט קריא, לפי שעון ישראל
function nowFormatted() {
  return new Date().toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// שולחת את הודעת הלקוח ל-OpenAI ומקבלת בחזרה תשובה חכמה
async function getAIReply(customerText) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `אתם הצוות של מאור ברקת עיצוב ותכנון, עסק בתחום עיצוב ותכנון. אתם עונים ללקוחות בוואטסאפ בגוף ראשון רבים ("אנחנו", "הצוות שלנו") - לא כאדם בודד ולא כ"אני" - כדי שהלקוח ירגיש שעומד מאחוריו צוות שלם שדואג לו, לא רק צ'אטבוט.

ידע רקע על מאור ועל השירות (תשתמש בזה כדי לענות בביטחון, לא רק להפנות הלאה):
- למאור מעל 18 שנות ניסיון בתחום, מתכנן ומעצב גם מבחינה אסתטית וגם מבחינה פרקטית - תכנון החלל, נקודות חשמל, אינסטלציה, מיזוג אוויר, נגרות, תאורה, ועד הפרטים הכי קטנים.
- פגישת הייעוץ האסטרטגית היא פגישה ממוקדת שבה מאור עוזר לוודא שהכל מתוכנן נכון, נותן הכוונה מדויקת, מצביע על אלמנטים שכדאי לבדוק לפני שהכל סגור, וחושף פתרונות ורעיונות שהלקוח לא חשב עליהם - כדי להפיק את המיטב מהבית עיצובית ופרקטית, לפני שמאוחר מדי.
- אחרי הפגישה, מאור מתאים לכל לקוח בדיוק את מה שדרוש - בין אם זו הנחיה ממוקדת ובין אם ליווי מלא עד רגע הכניסה לבית. יש מגוון אופציות ומחירים מותאמים אישית לפי הצרכים, הרצונות והתקציב.
- נקודת ערך חשובה שכדאי להעלות בשיחה עם מי שקנה דירה מקבלן: הרבה רוכשים חושבים שיש עוד המון זמן עד שינויי הדיירים, אבל בפועל כשמגיע השלב שהקבלן מבקש אישורים וחתימות (חלוקת חלל, מטבח, חשמל, תאורה, אינסטלציה) - הזמן לקבל החלטות קצר מאוד. לכן מומלץ להתחיל לחשוב על זה מראש, כדי לקבל החלטות רגועות ומדויקות בלי לחץ של הרגע האחרון.
- המטרה המרכזית של מאור היא לפתור ללקוחות בעיות שהם אפילו לא מודעים אליהן.

קישורים חיצוניים (לשימוש זהיר בלבד):
- אתר הבית (גלריה, אודות ועוד): https://www.maorbareket.com
- אינסטגרם (טיפים): https://www.instagram.com/maor_luxurydesign
- טיקטוק (טיפים): https://www.tiktok.com/@maor_luxury_design
- פייסבוק: https://www.facebook.com/share/1Ada3aumLx
שלח קישור **רק** אם הלקוח שואל במפורש על תיק עבודות, דוגמאות, רשתות חברתיות או האתר - ואז שלח **רק את הקישור הרלוונטי** לשאלה, לא את כולם ביחד. אל תיזום שליחת קישורים באמצע השיחה בלי שנשאלת, כדי לא "להוציא" את הלקוח מהשיחה לפני שהוא מחובר מספיק. אם שלחת קישור, אפשר להוסיף טיפ קטן: "אם הקישור לא נפתח, אפשר גם לשמור אותנו כאיש קשר".

כללים שחובה לשמור עליהם:
- ענה בעברית, בקצרה, באדיבות ובמקצועיות.
- כתוב את שם העסק "מאור ברקת עיצוב ותכנון" ואת השם "מאור" תמיד בדיוק כך, בלי גרשיים ובלי מרכאות באמצע המילים.
- דבר רק על נושאים שקשורים לעסק (עיצוב, תכנון, שירותי החברה). אם נשאלת על נושא לא קשור, הסבר בנימוס שאתה יכול לעזור רק בנושאים הקשורים לעסק.
- אסור לך להמציא מידע שאינך בטוח בו — לא תאריכים, לא זמינות, ולא פרטים על העסק שלא נמסרו לך. אם אינך יודע תשובה מדויקת, אמור זאת בכנות והצע שנציג אנושי יחזור עם התשובה המדויקת.
- מחיר אחד ויחיד שמותר לך לציין: עלות פגישת הייעוץ האסטרטגית היא 450 ₪ כולל מע"מ. זה המחיר היחיד שאתה מוסמך לתת - כל מחיר אחר (עיצוב, תכנון, ליווי בפועל) הוא אישי ומותאם לכל לקוח, ומאור בעצמו נותן אותו רק אחרי הפגישה. אם נשאלת עליו, הסבר שזה תלוי בצרכים והיקף הפרויקט, ויתבהר בפגישה.
- אל תתחייב בשם העסק להנחות, הטבות, מועדים או התחייבויות כלשהן — לכך נדרש אישור אדם מהצוות.
- שלב מדי פעם אימוג'ים חמודים ומתאימים (כמו 😊 🏡 ✨) כדי שהטון יהיה חם ונעים, בלי להגזים - לא בכל משפט.
- הטון שלכם אנרגטי, סוחף, ולבבי במיוחד - עוטף את הלקוח בתחושה שהוא הגיע בדיוק למקום הנכון ושצוות שלם עומד לצידו. עוררו סקרנות אמיתית להמשיך לשוחח ולהתקדם לפגישת הייעוץ האסטרטגית, כדי לקבל את הערך המלא. עשו זאת רק באמצעות הדגשת ערך אמיתי (מקצועיות, ניסיון, התאמה אישית) - לעולם לא באמצעות דחיפות מזויפת, הבטחות שאינכם בטוחים בהן, או לחץ שמרגיש לא כן.
- אינכם יודעים אם אתם פונים לגבר או לאישה. לכן פנו בגוף שני בלי לציין במפורש "אתה" או "את", והשתמשו במילים שכתובות זהה בזכר ובנקבה (כמו "רוצה", "אותך", "לך") כדי שהפנייה תרגיש אישית ומדויקת לכל אחד.`,
      },
      { role: 'user', content: customerText },
    ],
  });

  return completion.choices[0].message.content;
}

app.get('/', (req, res) => {
  res.send('השרת של הבוט עובד!');
});

// Meta שולחת בקשת GET לכתובת הזו כדי לאמת שהשרת שלנו הוא באמת שלנו
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('האימות מול Meta הצליח!');
    res.status(200).send(challenge);
  } else {
    console.log('האימות נכשל - מילת הסיסמה לא תואמת');
    res.sendStatus(403);
  }
});

// פונקציה ששולחת הודעת טקסט חזרה ללקוח דרך ה-API של Meta
async function sendReply(to, text) {
  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: true },
    }),
  });

  const data = await response.json();
  console.log('תשובת שליחה מ-Meta:', JSON.stringify(data));
}

// פונקציה ששולחת סרטון (קובץ שהועלה מראש ל-Meta, לפי מזהה) עם כיתוב
async function sendVideo(to, mediaId, caption) {
  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: { id: mediaId, caption },
    }),
  });

  const data = await response.json();
  console.log('תשובת שליחת וידאו מ-Meta:', JSON.stringify(data));
}

// שולחת הודעה עם עד 3 כפתורי בחירה מהירה (buttons = [{id, title}, ...])
async function sendButtons(to, bodyText, buttons) {
  const url = `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    }),
  });

  const data = await response.json();
  console.log('תשובת שליחת כפתורים מ-Meta:', JSON.stringify(data));
}

// שולחת תוכן של שלב מעקב (קישור או סרטון) ללקוח
async function sendStepContent(to, content) {
  if (!content) return;
  if (content.type === 'video') {
    await sendVideo(to, content.mediaId, content.caption);
  } else {
    await sendReply(to, `${content.caption}\n${content.url}`);
  }
}

const PAYMENT_INFO = `💳 פרטי תשלום לפגישת הייעוץ (450 ₪ כולל מע"מ):

ביט: 0524275581

העברה בנקאית:
בנק הפועלים (12), סניף 170 (רוטשילד)
מספר חשבון: 337344
על שם: מאור ברקת

לאחר התשלום נשמח לצילום מסך לאישור 🙏`;

// בונה את הודעת אישור הפגישה הסופית ללקוח, כולל התאמה לזום/פרונטלי לפי סוג הליד
function buildConfirmationMessage(segment) {
  const meetingType =
    segment === 'שיפוץ'
      ? 'הפגישה תתקיים אצלכם בבית (כדי לראות את המרחב מקרוב).'
      : 'הפגישה תתקיים בשיחת זום. חשוב להעביר לנו מראש את תכניות הבית 📐.';

  return `מעולה, הפגישה אושרה! 🎉

פגישת הייעוץ האסטרטגית שלנו, עד שעה וחצי, בשעה שביקשת.
${meetingType}

${PAYMENT_INFO}

מחכים לך, זו הזדמנות מצוינת לקבל הכוונה מקצועית לפני שמתחילים בתהליך ✨`;
}

// Meta שולחת בקשת POST לכתובת הזו בכל פעם שמגיעה הודעה חדשה מלקוח
app.post('/webhook', async (req, res) => {
  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  if (message) {
    const from = message.from;
    const text = message.text?.body || message.interactive?.button_reply?.title;
    console.log(`התקבלה הודעה חדשה ממספר ${from}: "${text}"`);

    try {
      // הודעות מהמספר האישי של מאור נחשבות כפקודות ניהול, לא כליד
      if (from === process.env.OWNER_PHONE) {
        const approveMatch = text?.match(/^(אשר|דחה)\s+(\d+)/);
        const sendMatch = text?.match(/^שלח\s+(\d+)\s+([\s\S]+)/);

        if (sendMatch) {
          const [, phone, customMessage] = sendMatch;
          await sendReply(phone, customMessage);
          await sendReply(from, `נשלח ללקוח ${phone} ✅ (זה לא עוצר שום רצף אוטומטי אחר)`);
          return res.sendStatus(200);
        }

        if (!approveMatch) {
          await sendReply(
            from,
            'פקודות זמינות:\n"אשר <מספר טלפון>"\n"דחה <מספר טלפון>"\n"שלח <מספר טלפון> <הודעה חופשית>"'
          );
          return res.sendStatus(200);
        }

        const [, action, phone] = approveMatch;
        const lead = await findLeadByPhone(phone);

        if (!lead) {
          await sendReply(from, `לא נמצא ליד עם המספר ${phone}`);
          return res.sendStatus(200);
        }

        if (action === 'אשר') {
          const segment = detectSegment(lead.data.קבלן_או_שיפוץ);
          await updateLead(lead.rowNumber, { סטטוס_פגישה: 'מאושר', שלב: 'פגישה_מאושרת' });
          await sendReply(phone, buildConfirmationMessage(segment));
          await sendReply(from, `אושר ונשלח ללקוח ${phone} ✅`);
        } else {
          await updateLead(lead.rowNumber, { סטטוס_פגישה: 'נדחה', שלב: 'ממתין_לשעת_פגישה' });
          await sendReply(phone, 'לצערנו השעה שביקשת לא מתאימה - תוכל להציע שעה אחרת שנוחה לך? 🙏');
          await sendReply(from, `נדחה, נשלחה ללקוח ${phone} בקשה לשעה חלופית`);
        }

        return res.sendStatus(200);
      }

      const now = nowFormatted();
      const existingLead = await findLeadByPhone(from);

      if (!existingLead) {
        // ליד חדש לגמרי - מתחילים את זרימת הסינון
        await createLead(from, { שלב: 'ממתין_לעיר', פנייה_אחרונה: now });
        console.log('נוצר ליד חדש בגיליון, מתחיל שאלון סינון');

        await sendReply(from, 'איזה כיף שהגעת אלינו! 💫 הגעת בדיוק למקום הנכון - הצוות שלנו כאן ללוות ולעזור בכל שלב 🤍');
        const aiReply = await getAIReply(text);
        await sendReply(from, aiReply);
        await sendReply(from, 'לפני שממשיכים - באיזה עיר נמצא הפרויקט? 🏙️');
        return res.sendStatus(200);
      }

      const stage = existingLead.data.שלב;
      const row = existingLead.rowNumber;

      // ערוץ צד לבקשת שיחה טלפונית - לא נוגע בשלב הרגיל של השיחה, אז לא עוצר שום רצף אחר
      if (existingLead.data.הערות === 'ממתין_לשעת_שיחה') {
        await updateLead(row, { הערות: `בקשת שיחה טלפונית: ${text}`, פנייה_אחרונה: now });
        await sendReply(from, 'תודה! נחזור אליך בטלפון בזמן שציינת 📞');
        await sendReply(
          process.env.OWNER_PHONE,
          `📞 בקשת שיחה טלפונית!\nמספר: ${from}\nזמן מבוקש: "${text}"`
        );
        return res.sendStatus(200);
      }

      if (/תתקשר|התקשר|טלפון|לא ברור|להתקשר/.test(text || '')) {
        await updateLead(row, { הערות: 'ממתין_לשעת_שיחה', פנייה_אחרונה: now });
        await sendReply(from, 'כמובן, אפשר גם שנחזור אליך בטלפון - מתי נוח לך שנתקשר? 📞');
        return res.sendStatus(200);
      }

      if (stage === 'ממתין_לעיר') {
        await updateLead(row, { עיר: text, שלב: 'ממתין_למגורים_השקעה', פנייה_אחרונה: now });
        await sendButtons(from, 'שמח שהצטרפת! 😊 בוא נכיר את הפרויקט טוב יותר - זה למגורים או להשקעה? 🏠💰', [
          { id: 'residential', title: 'למגורים' },
          { id: 'investment', title: 'להשקעה' },
        ]);
      } else if (stage === 'ממתין_למגורים_השקעה') {
        await updateLead(row, { מגורים_או_השקעה: text, שלב: 'ממתין_לקבלן_שיפוץ', פנייה_אחרונה: now });
        await sendButtons(from, 'מעולה, תודה על השיתוף! עוד שאלה קטנה - זה בית מקבלן לפני כניסה, או שמתכננים לשפץ/לתכנן אותו מחדש? 🔨', [
          { id: 'contractor', title: 'קבלן (לפני כניסה)' },
          { id: 'renovation', title: 'שיפוץ/תכנון מחדש' },
        ]);
      } else if (stage === 'ממתין_לקבלן_שיפוץ') {
        const step1Due = new Date(Date.now() + getDeltaHours(1) * 60 * 60 * 1000).toISOString();
        await updateLead(row, {
          קבלן_או_שיפוץ: text,
          שלב: 'ממתין_לשעת_פגישה',
          פנייה_אחרונה: now,
          שלב_מעקב: '0',
          מעקב_הבא: step1Due,
        });
        await sendReply(from, 'קיבלתי את כל הפרטים, תודה! ✨ הנה סרטון קצר שמסביר בדיוק על מה מדובר בפגישת הייעוץ:');
        await sendVideo(from, process.env.MEETING_VIDEO_MEDIA_ID, 'פגישת הייעוץ האסטרטגית - מה מחכה לך 👆');
        await sendReply(from, 'בוא נקבע כבר עכשיו את פגישת הייעוץ - באיזה יום ושעה נוח לך? 📅');
      } else if (stage === 'ממתין_לתשובת_סקרנות') {
        const segment = detectSegment(existingLead.data.קבלן_או_שיפוץ);
        const wantsMore = text.includes('כן');

        if (wantsMore) {
          const content = getStepContent(3, segment);
          await sendStepContent(from, content);
          // מעקב_הבא כבר מכיל את המועד המתוכנן המקורי לשלב 3 - נשתמש בו כבסיס לחישוב שלב 4
          const nextDue = new Date(
            new Date(existingLead.data.מעקב_הבא).getTime() + getDeltaHours(4) * 60 * 60 * 1000
          ).toISOString();
          await updateLead(row, { שלב: 'סינון_הושלם', שלב_מעקב: '3', מעקב_הבא: nextDue, פנייה_אחרונה: now });
        } else {
          await sendReply(from, 'בסדר גמור, נמשיך בקרוב עם עוד תוכן שיעניין אותך 😊');
          await updateLead(row, { שלב: 'סינון_הושלם', פנייה_אחרונה: now });
        }
      } else if (stage === 'סינון_הושלם') {
        // הליד ממשיך לשוחח אחרי שקיבל את הסרטון הראשון - מזמינים אותו לקבוע פגישה
        await updateLead(row, { שלב: 'ממתין_לשעת_פגישה', פנייה_אחרונה: now });
        const aiReply = await getAIReply(text);
        await sendReply(from, aiReply);
        await sendReply(from, 'רוצה לקבוע את פגישת הייעוץ? באיזה יום ושעה נוח לך? 📅');
      } else if (stage === 'ממתין_לשעת_פגישה') {
        await updateLead(row, { שעה_מבוקשת: text, סטטוס_פגישה: 'ממתין_לאישור', שלב: 'ממתין_לאישור_בעלים', פנייה_אחרונה: now });
        await sendReply(from, 'מעולה, אבדוק את הזמינות ואחזור אליך תוך זמן קצר עם אישור סופי 🙏');
        await sendReply(
          process.env.OWNER_PHONE,
          `📅 בקשת פגישה חדשה!\nמספר: ${from}\nשעה מבוקשת: "${text}"\n\nהשב "אשר ${from}" לאישור, או "דחה ${from}" לבקש שעה אחרת.`
        );
      } else {
        // ליד ידוע שכבר סיים את הסינון, או במצב לא מוכר - לא ממשיכים למכור אוטומטית
        await updateLead(row, { פנייה_אחרונה: now });
        await sendReply(from, 'היי! קיבלנו את ההודעה שלך ונחזור אליך בהקדם 😊');
        await sendReply(
          process.env.OWNER_PHONE,
          `⚠️ התקבלה הודעה ממספר קיים (${from}):\n"${text}"\n\nכדאי לבדוק את הסטטוס שלו לפני שהבוט ממשיך לדבר איתו.`
        );
      }
    } catch (err) {
      console.log('שגיאה בטיפול בהודעה:', err.message);
    }
  }

  res.sendStatus(200);
});

// נקודת קצה שה"שעון" החיצוני קורא לה כל כמה דקות, כדי לבדוק ולשלוח סרטוני מעקב שהגיע זמנם
app.get('/run-followups', async (req, res) => {
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.sendStatus(403);
  }

  try {
    const leads = await getAllLeads();
    const now = Date.now();
    let sentCount = 0;

    // ממשיכים לשלוח סרטוני מעקב גם ללידים שכבר מתקדמים בשיחה (למשל קובעים פגישה) -
    // ההסתמכות היא על מעקב_הבא ושלב_מעקב, לא על שלב השיחה הנוכחי
    for (const lead of leads) {
      if (!lead.data.מעקב_הבא) continue;

      const dueTime = new Date(lead.data.מעקב_הבא).getTime();
      if (isNaN(dueTime) || now < dueTime) continue;

      const segment = detectSegment(lead.data.קבלן_או_שיפוץ);
      const currentStep = parseInt(lead.data.שלב_מעקב || '0', 10);
      const nextStep = currentStep + 1;

      if (nextStep > maxStepFor(segment)) continue;

      const content = getStepContent(nextStep, segment);
      await sendStepContent(lead.data.טלפון, content);
      sentCount++;

      const updates = { שלב_מעקב: String(nextStep) };

      // שואלים את שאלת הסקרנות רק אם הליד עדיין לא התקדם הלאה בשיחה (למשל כבר קובע פגישה) -
      // כדי לא "לחטוף" לו את השיחה הפעילה
      if (nextStep === 2 && lead.data.שלב === 'סינון_הושלם') {
        await sendButtons(lead.data.טלפון, 'רוצה לראות עוד משהו מעניין? 👀', [
          { id: 'yes_more', title: 'כן, מעניין!' },
          { id: 'no_thanks', title: 'לא תודה' },
        ]);
        updates.שלב = 'ממתין_לתשובת_סקרנות';
      }

      const nextDelta = getDeltaHours(nextStep + 1);
      if (nextDelta) {
        updates.מעקב_הבא = new Date(dueTime + nextDelta * 60 * 60 * 1000).toISOString();
      } else {
        updates.מעקב_הבא = '';
      }

      await updateLead(lead.rowNumber, updates);
      console.log(`נשלח שלב מעקב ${nextStep} ל-${lead.data.טלפון}`);
    }

    res.send(`בוצע. נשלחו ${sentCount} הודעות מעקב.`);
  } catch (err) {
    console.log('שגיאה בהרצת המעקבים:', err.message);
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`השרת רץ בהצלחה על http://localhost:${PORT}`);
});
