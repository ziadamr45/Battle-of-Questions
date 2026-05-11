import { NextRequest, NextResponse } from 'next/server'
import { callLLM, webSearch } from '@/lib/openrouter'
import { db } from '@/lib/db'

// ============================================
// TYPES
// ============================================
type GameType = 'قراءة متحررة' | 'نصوص'
type Difficulty = 'سهل' | 'متوسط' | 'صعب'

interface Question {
  id: number
  text: string
  options: string[]
  correctAnswer: number
  explanation: string
}

interface GameContent {
  title: string
  text: string
  source: string
  questions: Question[]
}

interface GenerateContentRequest {
  gameType: GameType
  difficulty: Difficulty
  playerNames?: string[]
  previousTopics?: string[]
}

// ============================================
// DIVERSE TOPIC CATEGORIES - 40+ topics per type
// No fallback. Every piece of content is AI-generated.
// ============================================
const searchQueriesPool: Record<GameType, string[]> = {
  'قراءة متحررة': [
    // تاريخ وحضارات
    'الحضارة الإسلامية الأندلسية إنجازات علمية وفكرية',
    'تاريخ الحروب الصليبية وتأثيرها على العالم العربي',
    'الحضارة المصرية القديمة أهرامات وفراعنة',
    'تاريخ الدولة العثمانية وعلاقتها بالعالم العربي',
    'طريق الحرير التجارة بين الشرق والغرب',
    'الحضارة السومرية والبابلية في بلاد الرافدين',
    // علم وتكنولوجيا
    'الذكاء الاصطناعي وتأثيره على مستقبل التعليم',
    'استكشاف الفضاء والبعثات إلى المريخ',
    'الطاقة المتجددة الشمسية والرياح ومستقبل الكوكب',
    'التطور الطبي ثورة اللقاحات والعلاج الجيني',
    'تكنولوجيا النانو وثورة المواد الذكية',
    'البلوك تشين والعملات الرقمية مستقبل المال',
    // فلسفة وعقل
    'فلسفة التفكير النقدي وأهميته في العصر الرقمي',
    'نظرية الذكاءات المتعددة لهوارد غاردنر',
    'فلسفة الأخلاق والذكاء الاصطناعي تحديات جديدة',
    'علم النفس الإيجابي والسعادة البشرية',
    'قوة العادات وكيف تتشكل في الدماغ',
    // بيئة وطبيعة
    'التغير المناخي أسبابه وآثاره على الوطن العربي',
    'أزمة المياه في الشرق الأوسط وحلول مبتكرة',
    'التنوع البيولوجي والانقراض السادس',
    'التصحر في العالم العربي ومشاريع التشجير',
    'البحار والمحيطات ثروات مهددة بالتلوث',
    // اجتماع وثقافة
    'ظاهرة الهجرة الدماغية من الدول العربية',
    'التعليم عن بعد ثورة كوفيد وتحولات المستقبل',
    'هوية الشباب العربي بين الأصالة والعولمة',
    'المرأة العربية إنجازات وتحديات معاصرة',
    'الأسرة العربية في مواجهة التحديات المعاصرة',
    // اقتصاد وتنمية
    'الاقتصاد الأخضر فرص الاستدامة في الوطن العربي',
    'ريادة الأعمال الشبابية في المنطقة العربية',
    'رؤية 2030 التنمية المستدامة في السعودية',
    'السياحة الثقافية والتراثية في العالم العربي',
    // أدب وفنون
    'الأدب العربي الحديث رواد التجديد والتحول',
    'الفن التشكيلي العربي معاصرة وهوية',
    'السينما العربية نشأة وتطور وتحديات',
    'الموسيقى العربية تراث وتجديد من فيروز إلى اليوم',
    // صحة وطب
    'الصحة النفسية للمراهقين في عصر السوشيال ميديا',
    'الطب النبوي بين العلم والإيمان',
    'التغذية السليمة والطب الوقائي',
    'إدمان الهواتف الذكية تأثيره على الدماغ والسلوك',
    // رحلات واكتشافات
    'رحلة ابن بطوطة عبر العالم الإسلامي',
    'اكتشافات أثرية حديثة في العالم العربي',
  ],
  'نصوص': [
    // شعراء كبار
    'شعر المتنبي حكمة وفخر وصور بيانية',
    'شعر أبو تمام البديع والصنعة اللفظية',
    'شعر البحتري وصف وجلال الطبيعة',
    'رثاء الخنساء وعاطفة الأمومة الصادقة',
    'شعر عمر بن أبي ربيعة الغزل الصريح',
    'معلقة امرئ القيس وصف الليل والفرس',
    // نثر أدبي
    'أسلوب الجاحظ السخرية والفكاهة في البيان والتبيين',
    'رسائل إخوان الصفا فلسفة وبلاغة',
    'مقامات الهمذاني والحريري فن السجع والتضمين',
    'خطبة أبي بكر الصديق بعد وفاة النبي بلاغة وإيجاز',
    'وصف البديع الهمذاني للمدن والأسواق',
    // أدب حديث
    'شعر نزار قباني الحرية والمرأة والتحدي',
    'شعر محمود درويش الهوية والأرض والمنفى',
    'نثر جبران خليل جبران الفلسفة والتصوف الأدبي',
    'شعر أحمد شوقي أمير الشعراء بين التقليد والتجديد',
    'أدب نجيب محفوظ الواقعية المصرية والرمز',
    'شعر إلياس أبو شبكة الألم والوجدان',
    // بلاغة قرآنية
    'البلاغة القرآنية في سورة الرحمن التكرار والجمال',
    'القصص القرآني في سورة يوسف دروس بلاغية',
    'الحوار القرآني في سورة الكهف أساليب وإيقاع',
    'الاستعارات القرآنية في وصف الجنة والنار',
    'أسلوب القسم في القرآن الكريم دلالات بلاغية',
    // فنون بلاغية
    'فن الخطابة العربية قديما وحديثا أساليب الإقناع',
    'الرسائل الأدبية العربية تراث وبلاغة',
    'فن المقالة الأدبية العربية تحليل ونقد',
    'السجع والطباق في النثر العربي القديم',
    'الصور البيانية في وصف الطبيعة عند العرب',
    // نصوص وصفية
    'وصف القدس في الأدب العربي صور وحروف',
    'وصف الصحراء في الشعر العربي الجاهلي',
    'وصف البحر في الشعر العربي رومانسية وجلال',
    'وصف القمر والليل في الشعر العربي',
    // نصوص وجدانية
    'الغزل العذري عند عمر بن أبي ربيعة وجميل بثينة',
    'الشوق والحنين في أدب المنفى العربي',
    'الألم والوجدان في شعر إلياس أبو شبكة',
    'الحب العذري قصة مجنون ليلى في الأدب',
    // نصوص حماسية
    'الحماسة والفخر في شعر عنترة بن شداد',
    'الشجاعة والبطولة في المعلقات',
    'الجهاد والصبر في الشعر الإسلامي',
    'فخر القبائل في شعر العرب الجاهلي',
    // نصوص حكمية
    'الحكمة في شعر زهير بن أبي سلمى',
    'أمثال العرب وبلاغتها في النثر القديم',
    'الحكم والأمثال في رسائل إخوان الصفا',
    'فلسفة الوجود في الشعر العربي المعاصر',
  ],
}

// ============================================
// DIVERSE TOPIC SEEDS - force the AI to pick new angles
// ============================================
const topicSeeds: Record<GameType, string[]> = {
  'قراءة متحررة': [
    'اكتب عن شخصية عربية نسائية رائدة لم تحظ بشهرة كافية',
    'اكتب عن اختراع إسلامي غير معروف غيّر مجرى التاريخ',
    'اكتب عن مدينة عربية منسية كانت مركز حضارة',
    'اكتب عن ظاهرة طبيعية فريدة في العالم العربي',
    'اكتب عن تقنية مستقبلية وكيف ستغير حياتنا',
    'اكتب عن تحدّ بيئي يواجه منطقة عربية محددة وحلولاً مبتكرة',
    'اكتب عن تقاطع العلم والإيمان في حضارة إسلامية',
    'اكتب عن عادات اجتماعية عربية تتغير مع العولمة',
    'اكتب عن مشروع تنموي عربي ملهم يصلح نموذجاً',
    'اكتب عن تأثير لغة الضاد على طريقة تفكير أهلها',
    'اكتب عن رحالة عربي استكشف عوالم مجهولة',
    'اكتب عن اكتشاف أثري حديث في وطن عربي',
    'اكتب عن أزمة تعليمية وحلاً إبداعياً مقترحاً',
    'اكتب عن فن عربي تقليدي يواجه الانقراض',
    'اكتب عن تجربة تعايش بين ثقافات في مدينة عربية',
  ],
  'نصوص': [
    'اكتب نصاً أدبياً عن ذاكرة المكان وأثره في النفس',
    'اكتب نصاً عن لقاء بين شاعرين من عصرين مختلفين',
    'اكتب نصاً عن صمت الليل وما يبوح به الوجدان',
    'اكتب نصاً عن حوار بين النور والظلام',
    'اكتب نصاً عن رحلة البحث عن الهوية في الغربة',
    'اكتب نصاً عن جمال الكلمة حين تصبح سلاحاً',
    'اكتب نصاً عن الأمل الذي ينبت من ركام الألم',
    'اكتب نصاً عن الوداع ولقاء لا يكتمل',
    'اكتب نصاً عن علاقة الإنسان بالبحر كرمز للحرية',
    'اكتب نصاً عن القدس كمدينة تتحدث عن نفسها',
    'اكتب نصاً عن الشوق بأسلوب يستخدم الاستعارة المكنية',
    'اكتب نصاً عن الكبرياء والضعف البشري بصور بيانية',
    'اكتب نصاً عن الفقدان كتجربة إنسانية جامعة',
    'اكتب نصاً عن القمر كشاهد على أحلام البشر',
    'اكتب نصاً عن الحرية بين القيد والتحليق',
  ],
}

// ============================================
// HELPER: Strip markdown code blocks from JSON
// ============================================
function extractJSON(raw: string): string {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\n?```\s*$/i, '')
  }
  return cleaned.trim()
}

// ============================================
// HELPER: Validate GameContent structure
// ============================================
function isValidGameContent(obj: unknown): obj is GameContent {
  if (!obj || typeof obj !== 'object') return false
  const content = obj as Record<string, unknown>
  if (typeof content.title !== 'string') return false
  if (typeof content.text !== 'string') return false
  if (typeof content.source !== 'string') return false
  if (!Array.isArray(content.questions)) return false
  if (content.questions.length === 0) return false
  for (const q of content.questions as unknown[]) {
    if (!q || typeof q !== 'object') return false
    const question = q as Record<string, unknown>
    if (typeof question.id !== 'number') return false
    if (typeof question.text !== 'string') return false
    if (!Array.isArray(question.options) || question.options.length !== 4) return false
    if (typeof question.correctAnswer !== 'number') return false
    if (typeof question.explanation !== 'string') return false
  }
  return true
}

// ============================================
// HELPER: Build the LLM prompt - Enhanced for maximum diversity
// ============================================
function buildPrompt(
  gameType: GameType,
  difficulty: Difficulty,
  searchTitle?: string,
  searchSnippet?: string,
  previousTopics?: string[],
  seenTitles?: string[],
  topicSeed?: string
): string {
  const wordCounts: Record<Difficulty, string> = {
    سهل: '250-350 كلمة على الأقل - نص طبيعي غني بدون تقليم',
    متوسط: '350-500 كلمة على الأقل - نص تفصيلي عميق متعدد الأفكار',
    صعب: '450-650 كلمة على الأقل - نص مركّب معقد متعدد الطبقات والأفكار',
  }

  const questionCounts: Record<Difficulty, string> = {
    سهل: '3 أسئلة',
    متوسط: '5 أسئلة',
    صعب: '7 أسئلة',
  }

  const difficultyInstructions: Record<Difficulty, string> = {
    سهل: `مستوى سهل:
- أسئلة مباشرة من النص: الإجابة تُوجَد حرفياً أو شبه حرفياً في النص
- الخيارات واضحة الفرق: كل خيار مختلف بوضوح عن الآخر
- مثال: "ماذا شُبّهت القراءة في النص؟" والإجابة مكتوبة نصاً في القطعة`,

    متوسط: `مستوى متوسط:
- أسئلة فهم واستنتاج: الإجابة مش موجودة نصاً في النص لكن لازم تفهم وتستنتج
- الخيارات متقاربة جداً: الخيارات الأربعة تكون قريبة من بعض وعشان توصل للإجابة الصح لازم تفهم النص كويس
- ممنوع أسئلة الحل المباشر: الإجابة لازم تتطلب تفكير واستنتاج مش مجرد نسخ من النص
- مثال: "ما الهدف الرئيسي من ذكر الكاتب لهذه التجربة؟" - لازم تستنتج الهدف من السياق مش مكتوب مباشرة`,

    صعب: `مستوى صعب:
- أسئلة قدرات عليا (تحليل - تركيب - تقويم - استنتاج بعيد): الإجابة مش مباشرة خالص واحتياج تفكير عميق
- الأسئلة غير مباشرة: السؤال نفسه محتاج تفهم إيش قاصد بالضبط، وإجابته محتاجة تربط بين أكتر من فكرة في النص
- الخيارات متقاربة جداً جداً: كل الخيارات تبدو صحيحة ومانعرفش الفرق بينها إلا لو فاهم النص كويس ومركز على التفاصيل الدقيقة
- ممنوع تماماً أي سؤال مباشر من النص
- مثال: "ما الموقف الفلسفي الضمني الذي يتبناه الكاتب دون التصريح به؟" - لازم تحلل النص كله وتستنتج الموقف من بين السطور`,
  }

  const typeFocus =
    gameType === 'قراءة متحررة'
      ? 'ركّز على أسئلة الفهم والاستنتاج واستيعاب المقروء والتحليل الفكري'
      : 'ركّز على أسئلة البلاغة والتحليل الأدبي والتذوق والصور البيانية والمحسنات البديعية والأساليب الإنشائية'

  // Build search inspiration section
  const searchInspiration =
    searchTitle || searchSnippet
      ? `بناءً على نتيجة البحث التالية كإلهام فقط (لا تنسخه بل أنشئ نصاً أصلياً مبنياً على أفكاره):
العنوان: ${searchTitle || 'غير متوفر'}
المقتطف: ${searchSnippet || 'غير متوفر'}`
      : ''

  // Build topic seed instruction
  const seedInstruction = topicSeed
    ? `\n\n🎨 توجيه الموضوع: ${topicSeed} - استخدم هذا التوجيه كمحور أساسي لنصك ولكن بطريقتك الإبداعية الخاصة.`
    : ''

  // Build variety constraint
  let varietyConstraint = ''
  if (previousTopics && previousTopics.length > 0) {
    varietyConstraint += `\n\n🚫 مهم جداً: الموضوعات التالية تم استخدامها في جولات سابقة ويجب تجنبها تماماً:\n${previousTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}\nاختر موضوعاً مختلفاً تماماً عن كل ما سبق - لا تقترب حتى من نفس المجال.`
  }

  if (seenTitles && seenTitles.length > 0) {
    varietyConstraint += `\n\n🚫 مهم جداً: العناوين التالية تم استخدامها من قبل ويجب تجنبها:\n${seenTitles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}\nاختر عنواناً وموضوعاً جديدين تماماً مختلفين عن كل ما سبق.`
  }

  // Random style variation to force different outputs each time
  const styleVariations = [
    'أسلوب سردي قصصي يجعل القارئ يعيش التجربة',
    'أسلوب حواري يجعل الأفكار تتبادل بين أصوات مختلفة',
    'أسلوب وصفي يعتمد على الصور الحسية والمشاعر',
    'أسلوب تحليلي يفكك الظاهرة إلى أجزاء ويعيد تركيبها',
    'أسلوب مقارن يعرض وجهات نظر متعددة ثم يخلص لرؤية',
    'أسلوب تاريخي يربط الماضي بالحاضر والمستقبل',
    'أسلوب فلسفي يتأمل الظاهرة من زوايا عميقة',
  ]
  const randomStyle = styleVariations[Math.floor(Math.random() * styleVariations.length)]

  return `أنت معلم خبير في اللغة العربية متخصص في إعداد امتحانات القراءة المتحررة والنصوص لمرحلة الثانوية العامة. تُنتج محتوى عربياً أصيلاً ومتنوعاً بأسلوب أدبي رفيع مع الالتزام التام بقواعد اللغة العربية الصحيحة نحواً وصرفاً وإملاءً.

⚠️ قاعدة ذهبية: كل نص تنتجه يجب أن يكون فريداً ومختلفاً تماماً عن أي نص آخر. لا تكرر أبداً نفس الموضوع أو نفس الأفكار أو نفس الأمثلة. كن مبدعاً في اختيار الزوايا والأمثلة.

${searchInspiration}${seedInstruction}${varietyConstraint}

أنشئ تمرين قراءة متحررة كامل بالمتطلبات التالية:

نوع اللعبة: ${gameType}
مستوى الصعوبة: ${difficulty}

القواعد:
1. اكتب نصاً عربياً أصلياً طويلاً وغنياً بالمعلومات والتفاصيل (غير منسوخ من أي مكان). يجب أن يكون النص:
   - مستوى "سهل": 250-350 كلمة على الأقل - نص طبيعي غني بدون تقليم
   - مستوى "متوسط": 350-500 كلمة على الأقل - نص تفصيلي عميق متعدد الأفكار
   - مستوى "صعب": 450-650 كلمة على الأقل - نص مركّب معقد متعدد الطبقات والأفكار
   
   النص المطلوب: ${wordCounts[difficulty]}
   
   ⚠️ مهم جداً: اكتب النص كاملاً بدون اختصار أو تقليم. النص لازم يكون غني بالأفكار والتفاصيل عشان يكفي للأسئلة.
   
   🎨 أسلوب الكتابة المطلوب: ${randomStyle}

2. ${typeFocus}

3. عدد الأسئلة المطلوبة: ${questionCounts[difficulty]}

4. كل سؤال يجب أن يحتوي على 4 خيارات بالضبط (أ، ب، ج، د) مع إجابة صحيحة واحدة فقط

5. ${difficultyInstructions[difficulty]}

6. أضف شرحاً تفصيلياً لماذا الإجابة الصحيحة هي الصحيحة ولماذا الخيارات الأخرى خاطئة

7. ⚠️ التزام تام بقواعد اللغة العربية:
   - تأكد من صحة النحو والصرف في كل جملة
   - تأكد من صحة الهمزات والتاء المربوطة والمفتوحة
   - تأكد من صحة علامات الترقيم العربية
   - لا تستخدم أي كلمة أو تركيب غير عربي صحيح
   - راجع النص كله قبل الإرسال وتأكد من خلوه من أي أخطاء لغوية

أجب بصيغة JSON فقط بدون أي نص إضافي أو markdown أو code blocks:
{
  "title": "عنوان النص",
  "text": "النص الكامل هنا...",
  "source": "مصدر الإلهام",
  "questions": [
    {
      "id": 1,
      "text": "نص السؤال",
      "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
      "correctAnswer": 0,
      "explanation": "شرح لماذا الإجابة صحيحة"
    }
  ]
}`
}

// ============================================
// HELPER: Generate content with retry logic
// ============================================
async function generateWithRetry(
  gameType: GameType,
  difficulty: Difficulty,
  previousTopics?: string[],
  seenTitles?: string[],
  maxRetries: number = 3
): Promise<{ content: GameContent; searchTitle?: string; searchSnippet?: string } | null> {
  const usedQueries = new Set<string>()

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[Generate] Attempt ${attempt + 1}/${maxRetries}`)

      // Step 1: Web search for inspiration - pick a random unused query
      let searchTitle: string | undefined
      let searchSnippet: string | undefined
      let topicSeed: string | undefined

      try {
        const queryPool = searchQueriesPool[gameType]
        let availableQueries = queryPool.filter(q => !usedQueries.has(q))
        if (availableQueries.length === 0) {
          usedQueries.clear()
          availableQueries = queryPool
        }
        const randomQuery = availableQueries[Math.floor(Math.random() * availableQueries.length)]
        usedQueries.add(randomQuery)

        // Also pick a random topic seed for extra variety
        const seeds = topicSeeds[gameType]
        topicSeed = seeds[Math.floor(Math.random() * seeds.length)]

        // Search using DuckDuckGo
        const searchResults = await webSearch(randomQuery)

        if (searchResults.length > 0) {
          const chosenResult = searchResults[Math.floor(Math.random() * Math.min(searchResults.length, 5))]
          searchTitle = chosenResult.name
          searchSnippet = chosenResult.snippet
        }
      } catch (searchError) {
        console.error('[Generate] Web search failed, proceeding without search:', searchError)
      }

      // Always pick a topic seed even if search failed
      if (!topicSeed) {
        const seeds = topicSeeds[gameType]
        topicSeed = seeds[Math.floor(Math.random() * seeds.length)]
      }

      // Step 2: Use LLM to generate content via OpenRouter
      const prompt = buildPrompt(
        gameType,
        difficulty,
        searchTitle,
        searchSnippet,
        previousTopics,
        seenTitles,
        topicSeed
      )

      const responseText = await callLLM(
        [
          {
            role: 'system',
            content:
              'أنت معلم خبير في اللغة العربية متخصص في إعداد امتحانات القراءة المتحررة والنصوص لمرحلة الثانوية العامة. تُنتج محتوى عربياً أصيلاً ومتنوعاً بأسلوب أدبي رفيع مع الالتزام التام بقواعد اللغة العربية النحوية والصرفية والإملائية. كل نص تنتجه يجب أن يكون فريداً ومختلفاً. تُجيب دائماً بصيغة JSON صالحة فقط بدون أي نص إضافي.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        { timeoutMs: 120000 }
      )

      if (!responseText) {
        console.error(`[Generate] Attempt ${attempt + 1}: Empty LLM response`)
        continue
      }

      // Step 3: Parse and validate the response
      const cleanedJSON = extractJSON(responseText)
      let parsed: unknown

      try {
        parsed = JSON.parse(cleanedJSON)
      } catch {
        const jsonMatch = cleanedJSON.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0])
          } catch {
            console.error(`[Generate] Attempt ${attempt + 1}: Could not parse JSON`)
            continue
          }
        } else {
          console.error(`[Generate] Attempt ${attempt + 1}: No JSON found in response`)
          continue
        }
      }

      // Validate the structure
      if (isValidGameContent(parsed)) {
        const validatedQuestions = parsed.questions.map((q, index) => ({
          ...q,
          id: index + 1,
          correctAnswer: Math.max(0, Math.min(3, q.correctAnswer)),
        }))

        const content: GameContent = {
          title: parsed.title,
          text: parsed.text,
          source: parsed.source,
          questions: validatedQuestions,
        }

        return { content, searchTitle, searchSnippet }
      } else {
        console.error(`[Generate] Attempt ${attempt + 1}: Invalid content structure`)
        continue
      }
    } catch (err) {
      console.error(`[Generate] Attempt ${attempt + 1} failed:`, err)
      continue
    }
  }

  return null
}

// ============================================
// CONTENT PRE-CACHE
// Generate content in background so it's ready instantly
// ============================================
interface CacheEntry {
  content: GameContent
  gameType: GameType
  difficulty: Difficulty
  createdAt: number
}

const contentCache: CacheEntry[] = []
const MAX_CACHE_SIZE = 12 // 2 types × 3 difficulties × 2 per combo
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

function cleanCache() {
  const now = Date.now()
  // Remove expired entries
  while (contentCache.length > 0 && now - contentCache[0].createdAt > CACHE_TTL) {
    contentCache.shift()
  }
  // Remove oldest if over size
  while (contentCache.length > MAX_CACHE_SIZE) {
    contentCache.shift()
  }
}

function getFromCache(gameType: GameType, difficulty: Difficulty, seenTitles?: string[]): GameContent | null {
  cleanCache()
  // Find entries that match type+difficulty AND haven't been seen by any player
  const idx = contentCache.findIndex(e => {
    if (e.gameType !== gameType || e.difficulty !== difficulty) return false
    // If we have seenTitles, skip cached content that any player has already seen
    if (seenTitles && seenTitles.length > 0 && seenTitles.includes(e.content.title)) return false
    return true
  })
  if (idx !== -1) {
    const entry = contentCache.splice(idx, 1)[0]
    return entry.content
  }
  return null
}

function addToCache(content: GameContent, gameType: GameType, difficulty: Difficulty) {
  cleanCache()
  contentCache.push({ content, gameType, difficulty, createdAt: Date.now() })
}

// Background pre-warming: generate content for common combos
let warmingInProgress = false

async function warmCache() {
  // Pre-warming disabled - OpenRouter API takes too long for background warming
  // Content will be generated on-demand instead
}

// ============================================
// MAIN HANDLER
// ============================================
export async function POST(request: NextRequest) {
  // Global API route timeout of 2 minutes (Arabic content generation takes time)
  const globalTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 130000))
  const globalRaceResult = await Promise.race([request.json(), globalTimeout])
  if (!globalRaceResult) {
    return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
  }

  try {
    // Parse and validate request body
    const body: unknown = globalRaceResult
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { gameType, difficulty, playerNames, previousTopics } = body as GenerateContentRequest

    // Validate gameType
    const validGameTypes: GameType[] = ['قراءة متحررة', 'نصوص']
    if (!validGameTypes.includes(gameType)) {
      return NextResponse.json(
        { error: `Invalid gameType. Must be one of: ${validGameTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate difficulty
    const validDifficulties: Difficulty[] = ['سهل', 'متوسط', 'صعب']
    if (!validDifficulties.includes(difficulty)) {
      return NextResponse.json(
        { error: `Invalid difficulty. Must be one of: ${validDifficulties.join(', ')}` },
        { status: 400 }
      )
    }

    // Get seen passage titles for these players
    let seenTitles: string[] = []
    if (playerNames && playerNames.length > 0) {
      try {
        const seenPassages = await db.seenPassage.findMany({
          where: { playerName: { in: playerNames } },
          include: { passage: { select: { title: true } } },
        })
        seenTitles = [...new Set(seenPassages.map(sp => sp.passage.title))]
      } catch (dbError) {
        console.error('Failed to query seen passages:', dbError)
        // Continue without seen titles
      }
    }

    // Step 1: Check cache first for instant delivery (skip content players have already seen)
    const cachedContent = getFromCache(gameType, difficulty, seenTitles)
    if (cachedContent) {
      console.log(`[Cache] HIT: ${gameType} / ${difficulty} - "${cachedContent.title}"`)

      // Save passage to database for tracking
      try {
        const passage = await db.passage.create({
          data: {
            title: cachedContent.title,
            text: cachedContent.text,
            gameType: gameType,
            difficulty: difficulty,
            topic: cachedContent.title,
            source: cachedContent.source,
          },
        })

        if (playerNames && playerNames.length > 0) {
          for (const name of playerNames) {
            try {
              await db.seenPassage.create({
                data: { playerName: name, passageId: passage.id },
              })
            } catch {
              // Skip if already exists
            }
          }
        }
      } catch (dbError) {
        console.error('Failed to save cached passage:', dbError)
      }

      // Trigger background cache warming to replace what we just used
      warmCache().catch(() => {})

      return NextResponse.json({ content: cachedContent })
    }

    // Step 2: No cache hit — generate fresh content
    console.log(`[Cache] MISS: ${gameType} / ${difficulty} — generating fresh`)

    // Generate with retry logic (3 attempts with different search queries)
    const result = await generateWithRetry(gameType, difficulty, previousTopics, seenTitles, 3)

    if (!result) {
      return NextResponse.json(
        { error: 'فشل في توليد المحتوى بعد محاولات متعددة. حاول مرة أخرى.' },
        { status: 503 }
      )
    }

    const { content } = result

    // Save passage to database for tracking
    try {
      const passage = await db.passage.create({
        data: {
          title: content.title,
          text: content.text,
          gameType: gameType,
          difficulty: difficulty,
          topic: content.title,
          source: content.source,
        },
      })

      if (playerNames && playerNames.length > 0) {
        for (const name of playerNames) {
          try {
            await db.seenPassage.create({
              data: { playerName: name, passageId: passage.id },
            })
          } catch {
            // Skip if already exists
          }
        }
      }
    } catch (dbError) {
      console.error('Failed to save passage:', dbError)
    }

    // Trigger background cache warming
    warmCache().catch(() => {})

    return NextResponse.json({ content })
  } catch (error) {
    console.error('Generate content API error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ داخلي. حاول مرة أخرى.' },
      { status: 500 }
    )
  }
}

// Trigger initial cache warming on cold start
setTimeout(() => warmCache().catch(() => {}), 2000)
