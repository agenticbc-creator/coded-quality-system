import { cookies } from "next/headers";

export type Lang = "en" | "ar";

/** The interface language, from the "lang" cookie. Arabic covers the menus and the top bar for now; pages are still English. */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return store.get("lang")?.value === "ar" ? "ar" : "en";
}

// Draft Arabic labels for the app shell. To be checked by a CODED Arabic reviewer before release.
const AR: Record<string, string> = {
  // Sections
  Home: "الرئيسية", Quality: "الجودة", Approvals: "الاعتمادات", "People & growth": "الأشخاص والتطوير", Help: "المساعدة",
  // Menu items
  "My dashboard": "لوحتي", "My team": "فريقي", "My CCTP path": "مساري في برنامج المدرّب المعتمد", "Segment overview": "نظرة على القطاع",
  "Education home": "الصفحة الرئيسية للتعليم", Today: "اليوم", Overview: "نظرة عامة", People: "الأشخاص", "QA calendar": "تقويم زيارات الجودة",
  System: "النظام", "Waiting on me": "بانتظاري", Calendar: "التقويم", Visits: "الزيارات", "Release queue": "قائمة إصدار الملاحظات",
  "Log feedback": "تسجيل ملاحظة", "360° reviews": "تقييمات 360°", Scores: "الدرجات", "Master classes": "الحصص النموذجية",
  Content: "المحتوى", Cohorts: "الدفعات", "Levels & readiness": "المستويات والجاهزية", "QAer onboarding": "تهيئة مقيّمي الجودة",
  CCTP: "برنامج المدرّب المعتمد", "Report card": "بطاقة الأداء", Handbook: "الدليل", "PRD coverage": "تغطية المتطلبات",
  // Top bar
  "Sample data": "بيانات تجريبية", Notifications: "الإشعارات", "Switch person": "تبديل الشخص", "Open menu": "فتح القائمة",
  "Every person shown is fictional": "كل الأشخاص المعروضين وهميون",
};

/** Translates a shell label; anything without an Arabic label stays in English. */
export const tr = (lang: Lang, s: string) => (lang === "ar" ? AR[s] ?? s : s);
