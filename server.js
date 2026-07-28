const express =
const express = require('express');
const cors = require('cors');
const app = express();


app.use(cors());
app.use(express.json());


const VALID_LEVELS = ["متصدی", "کاردان", "کارشناس", "مسئول قسمت", "مسئول بخش", "مدیر"];


app.post('/api/analyze', async (req, res) => {
  try {
    const { jobTitle, jobCode, jobLevel, organizationalUnit, jobDescription } = req.body;


    // اعتبارسنجی
    const errors = [];
    if (!jobTitle?.trim()) errors.push("عنوان پست الزامی است.");
    if (!VALID_LEVELS.includes(jobLevel)) errors.push("سطح پست معتبر نیست.");
    if (!organizationalUnit?.trim()) errors.push("واحد سازمانی الزامی است.");
    if (!jobDescription?.trim() || jobDescription.trim().length < 40) {
      errors.push("شرح شغل باید حداقل ۴۰ کاراکتر باشد.");
    }
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join(" ") });
    }


    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "کلید API تنظیم نشده است."
      });
    }


    // پرامپت سیستم
    const systemPrompt = `شما موتور تحلیل شایستگی سامانه SHAYDA هستید. فقط یک JSON معتبر برگردانید با این کلیدها:
{
  "shaydaScore": number,
  "matchScore": number,
  "riskScore": number,
  "riskLevel": "پایین"|"متوسط"|"بالا"|"بحرانی",
  "jobSummary": string,
  "riskExplanation": string,
  "competencies": [{"name": string, "definition": string, "required": number, "current": number, "gap": number}],
  "technicalSkills": [string],
  "behavioralSkills": [string],
  "softwareSkills": [string],
  "strengths": [string],
  "developmentRoadmap": string,
  "trainingCourses": [string],
  "improvementAreas": [string],
  "managementRecommendation": string,
  "analysisExplanation": string
}`;


    const userPrompt = `عنوان: ${jobTitle}
سطح: ${jobLevel}
واحد: ${organizationalUnit}
شرح شغل: ${jobDescription}`;


    // فراخوانی Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      })
    });


    const data = await response.json();
    const text = data.content.find(b => b.type === "text").text;


    // پارس کردن JSON
    const cleaned = text.replace(/```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const analysis = JSON.parse(cleaned);


    // اضافه کردن اطلاعات پست
    analysis.postTitle = jobTitle.trim();
    analysis.postCode = jobCode?.trim() || "—";
    analysis.postLevel = jobLevel;
    analysis.organizationalUnit = organizationalUnit;


    res.json({ success: true, analysis });


  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "خطا در پردازش تحلیل. دوباره تلاش کنید."
    });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
