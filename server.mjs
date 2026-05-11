import { createServer } from 'http'
import next from 'next'
import { Server } from 'socket.io'

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = 3000

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    handle(req, res, parsedUrl)
  })

  // ─── Socket.IO Setup ────────────────────────────────────────────────────────
  const io = new Server(httpServer, {
    path: '/socket.io/',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    pingTimeout: 10000,
    pingInterval: 5000,
  })

  // ─── In-Memory State ────────────────────────────────────────────────────────

  const rooms = new Map()
  const socketRoomMap = new Map()
  let globalJoinCounter = 0

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

  function generateRoomCode() {
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
    }
    while (rooms.has(code)) {
      code = ''
      for (let i = 0; i < 6; i++) {
        code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
      }
    }
    return code
  }

  function playersToArray(players) {
    return Array.from(players.values()).sort((a, b) => a.joinOrder - b.joinOrder)
  }

  function findNextHost(players, excludeId) {
    let earliest
    for (const player of players.values()) {
      if (excludeId && player.id === excludeId) continue
      if (!earliest || player.joinOrder < earliest.joinOrder) {
        earliest = player
      }
    }
    return earliest
  }

  function getPublicRoomsList() {
    const list = []
    for (const room of rooms.values()) {
      if (room.roomType === 'عامة' && room.status === 'waiting' && room.players.size > 0) {
        list.push({
          roomCode: room.roomCode,
          roomType: room.roomType,
          hasPassword: !!room.password,
          hostName: room.hostName,
          playerCount: room.players.size,
          maxPlayers: room.settings.maxPlayers,
          settings: room.settings,
          status: room.status,
        })
      }
    }
    return list
  }

  function calculateScore(isCorrect, timeTaken, roundTimeSeconds) {
    if (!isCorrect) return 0
    const base = 10
    const speedBonus = Math.max(0, 5 * (1 - timeTaken / roundTimeSeconds))
    return Math.round((base + speedBonus) * 10) / 10
  }

  // ─── Fallback Content ───────────────────────────────────────────────────────

  const fallbackContent = {
    'قراءة متحررة': {
      'سهل': {
        title: 'أهمية القراءة في حياتنا',
        text: 'القراءة هي نافذة الإنسان على العالم، بها يتعرّف على الحضارات والثقافات المختلفة ويتواصل مع عقول العباقرة عبر العصور. إنها ليست مجرد فكّ للحروف وفهم الكلمات، بل هي رحلة عقلية تنقل القارئ إلى عوالم جديدة لم يكن ليعرفها لولا الكتب. وقد قالوا قديماً: "من قرأ كتب لم يُسافر، ومن سافر لم يُقرأ" - يعنون أن القراءة تغني عن السفر في كسب المعرفة والخبرة. والقراءة المنتظمة تبني عقل الإنسان وتوسع مداركه، وتجعله قادراً على التفكير النقدي والتحليل العميق. كما أنها تُثري اللغة وتُحسّن التعبير، وتُنمّي الخيال والإبداع. وقد أثبتت الدراسات الحديثة أن الأشخاص الذين يقرأون بانتظام يتمتعون بقدرة أفضل على التركيز والفهم والتحليل مقارنة بغيرهم. ولا تقتصر فوائد القراءة على الجانب العقلي فقط، بل تمتد إلى الجانب النفسي والاجتماعي. فالقراءة تُخفّف التوتر والقلق، وتُعزّز التعاطف مع الآخرين من خلال فهم تجاربهم وقصصهم. كما أنها تُساهم في بناء مجتمع واعٍ ومثقّف قادر على مواجهة التحديات بحكمة وبصيرة. لذلك يجب أن نغرس حب القراءة في نفوس أبنائنا منذ الصغر، وأن نوفر لهم البيئة المناسبة والمكتبات الغنية بالكتب المتنوعة. فالطفل الذي يعتاد القراءة يكبر ليصبح إنساناً متفتّح الذهن، واسع الأفق، قادراً على الإسهام في بناء مجتمعه وتطويره.',
        source: 'محتوى احتياطي',
        questions: [
          { id: 1, text: 'ماذا شُبّهت القراءة في النص؟', options: ['نافذة الإنسان على العالم', 'باب المعرفة', 'مفتاح العلم', 'جسر الثقافات'], correctAnswer: 0, explanation: 'شُبّهت القراءة بالنافذة كما ورد في الجملة الأولى.' },
          { id: 2, text: 'ما الفائدة التي ذكرها النص للقراءة المنتظمة؟', options: ['تحسين الخط', 'بناء العقل وتوسيع المدارك', 'زيادة الثروة المادية', 'تعلم اللغات الأجنبية'], correctAnswer: 1, explanation: 'ورد في النص أن القراءة المنتظمة تبني عقل الإنسان وتوسع مداركه.' },
          { id: 3, text: 'ما المعنى المقصود بالقول "من قرأ كتب لم يُسافر"؟', options: ['القراءة تُغني عن السفر في كسب المعرفة', 'القارئ لا يحب السفر', 'الكتب أرخص من السفر', 'السفر أفضل من القراءة'], correctAnswer: 0, explanation: 'المعنى أن القراءة تُفيد كما يُفيد السفر في اكتساب المعرفة.' },
        ],
      },
      'متوسط': {
        title: 'اللغة العربية وتطوّرها عبر العصور',
        text: 'تُعدّ اللغة العربية من أقدم اللغات السامية وأكثرها انتشاراً، وقد مرّت بمراحل تطوّر طويلة شكّلت هويتها وجعلتها لغة ثرية ومتجذّرة في التاريخ. ففي العصر الجاهلي، كانت اللغة العربية فصيحة بليغة، تُعصَم من اللحن، وتحفظ بالشعر والخطابة والمعلّقات التي عُلّقت على أستار الكعبة. ومع نزول القرآن الكريم، بلغت العربية ذروة مجدها، إذ أصبحت لغة الوحي الإلهي، فتهاوى الناس على تعلّمها وإتقانها، ونشط علماء اللغة في تدوين قواعدها وضبط نحوها وصرفها. وقد ظهر في القرن الثاني والثالث الهجريين أعلام كبار مثل سيبويه والخليل بن أحمد الفراهيدي الذي ألّف معجم العين. أمّا في العصر العباسي، فقد اتسع رقعة الدولة العربية واختلط العرب بغيرهم من الأمم، فدخلت في العربية كثير من المفردات الأعجمية، لكن العلماء حرصوا على تنقية اللغة وصيانتها من الفساد. واليوم، تواجه العربية تحديات عصرية تتمثل في هيمنة اللغات الأجنبية وتأثير التقنية الحديثة، لكنها لا تزال صامدة بفضل الجهود المبذولة في التعريب والترجمة.',
        source: 'محتوى احتياطي',
        questions: [
          { id: 1, text: 'كيف كانت اللغة العربية محفوظة في العصر الجاهلي؟', options: ['بالكتابة في المساجد', 'بالشعر والخطابة والمعلّقات', 'بالتدريس في المدارس', 'بالترجمة من اللغات الأجنبية'], correctAnswer: 1, explanation: 'ورد أن العربية كانت تحفظ بالشعر والخطابة والمعلّقات.' },
          { id: 2, text: 'ما الحدث الذي جعل العربية تبلغ ذروة مجدها؟', options: ['فتح الأندلس', 'نزول القرآن الكريم', 'تأسيس بغداد', 'اختراع الورق'], correctAnswer: 1, explanation: 'ذكر النص أن مع نزول القرآن الكريم بلغت العربية ذروة مجدها.' },
          { id: 3, text: 'من هو العالم الذي ألّف معجم العين؟', options: ['سيبويه', 'ابن جني', 'الخليل بن أحمد الفراهيدي', 'ابن منظور'], correctAnswer: 2, explanation: 'ورد أن الخليل بن أحمد الفراهيدي هو من ألّف معجم العين.' },
          { id: 4, text: 'ما التحديات العصرية التي تواجه اللغة العربية اليوم؟', options: ['قلة المعاجم', 'هيمنة اللغات الأجنبية وتأثير التقنية', 'ضعف الشعراء', 'انعدام المدارس'], correctAnswer: 1, explanation: 'ذكر النص أن التحديات تتمثل في هيمنة اللغات الأجنبية وتأثير التقنية.' },
          { id: 5, text: 'ما موقف العلماء من دخول المفردات الأعجمية في العصر العباسي؟', options: ['شجّعوها', 'تجاهلوها', 'حرصوا على تنقية اللغة وصيانتها', 'ترجموها كلها'], correctAnswer: 2, explanation: 'ورد أن العلماء حرصوا على تنقية اللغة وصيانتها من الفساد.' },
        ],
      },
      'صعب': {
        title: 'الفلسفة اللغوية وأثرها في تشكيل الوعي العربي',
        text: 'تتجاوز اللغة كونها مجرد أداة تواصل إلى كونها نظاماً فكرياً يُشكّل رؤية الإنسان للعالم ويُحدّد إطارات تفكيره. وهذه الفرضية التي طرحها فلاسفة اللغة مثل فيتغنشتاين وسابير وورف، تجد تطبيقاً عميقاً في اللغة العربية التي تتسم بخصائص بنيوية فريدة تميّزها عن غيرها من اللغات. فالجملة العربية بطبيعتها تركيبية تقبل التأخير والتقديم والفصل والوصل بما يخدم المعنى المراد، وهذا يمنح المتكلم مرونة استثنائية في التعبير عن دقائق المعاني وتلوين الخطاب بحسب السياق. وليس عبثاً أن قال الجاحظ: "البيان عماد الفصاحة، والمعنى هو القائد واللفظ هو المقتاد". كما أن النظام الصرفي العربي القائم على الجذور الثلاثية يُتيح اشتقاق آلاف الكلمات من أصل واحد، ممّا يجعل العربية من أكثر اللغات إنتاجية للمفردات. وقد أدرك علماء العربية القدامى هذا البعد الفلسفي للغة، فذهب ابن جني في كتابه "الخصائص" إلى أن "اللغة توقيف وإلهام"، أي أن أصل اللغة وحي وإلهام من الله تعالى. وعلى صعيد العصر الحديث، يُطرح تساؤل جوهري: هل تستطيع العربية أن تستوعب مفاهيم العصر الرقمي دون أن تفقد هويتها؟ يجيب المحافظون بأن العربية كافية لكل عصر لأنها لغة حية متجدّدة.',
        source: 'محتوى احتياطي',
        questions: [
          { id: 1, text: 'ما الفرضية التي طرحها فلاسفة اللغة حول علاقة اللغة بالتفكير؟', options: ['اللغة مجرد أداة تواصل', 'اللغة نظام فكري يُشكّل رؤية الإنسان للعالم', 'التفكير مستقل عن اللغة', 'اللغات جميعها تُشكّل الوعي بنفس الطريقة'], correctAnswer: 1, explanation: 'ورد أن اللغة نظام فكري يُشكّل رؤية الإنسان للعالم.' },
          { id: 2, text: 'ما الذي يمنح الجملة العربية مرونة استثنائية؟', options: ['كثرة المترادفات', 'طبيعتها التركيبية وقبولها التأخير والتقديم', 'استخدامها الحروف المقطعة', 'افتقارها للقواعد'], correctAnswer: 1, explanation: 'ذكر النص أن الجملة العربية تركيبية تقبل التأخير والتقديم.' },
          { id: 3, text: 'ما المقصود بعبارة الجاحظ "اللفظ هو المقتاد"؟', options: ['اللفظ أهم من المعنى', 'المعنى يقود واللفظ يتبعه', 'اللفظ والمعنى متساويان', 'اللفظ مستقل عن المعنى'], correctAnswer: 1, explanation: 'المقتاد هو المتبع، فالمعنى هو القائد واللفظ يتبعه.' },
          { id: 4, text: 'لماذا تُعدّ العربية من أكثر اللغات إنتاجية للمفردات؟', options: ['لأنها تحتوي على أكبر عدد من الحروف', 'بسبب نظامها الصرفي القائم على الجذور الثلاثية', 'لأنها لا تتبع قواعد صارمة', 'لأنها اقترضت كلمات من لغات كثيرة'], correctAnswer: 1, explanation: 'ورد أن النظام الصرفي القائم على الجذور الثلاثية يُتيح اشتقاق آلاف الكلمات.' },
          { id: 5, text: 'ما الفرق بين نظرة ابن جني لأصل اللغة والنظرة الغربية؟', options: ['لا فرق بينهما', 'ابن جني يراها إلهاماً والغربية نشاطاً بشرياً', 'ابن جني يراها بشرية والغربية إلهية', 'كلاهما يراهانها تطوّراً طبيعياً'], correctAnswer: 1, explanation: 'ذكر أن ابن جني يرى أن اللغة توقيف وإلهام بينما النظرة الغربية تراها نشاطاً بشرياً.' },
          { id: 6, text: 'ما موقف المحافظين من قدرة العربية على استيعاب مفاهيم العصر الرقمي؟', options: ['يعتقدون أنها تحتاج لإصلاح جذري', 'يرون أنها كافية لأنها لغة حية متجدّدة', 'يرون أنها عاجزة', 'يطلبون استبدالها بلغة أجنبية'], correctAnswer: 1, explanation: 'ورد أن المحافظون يرون أن العربية كافية لكل عصر لأنها لغة حية متجدّدة.' },
          { id: 7, text: 'ما معنى "اللغة توقيف وإلهام" عند ابن جني؟', options: ['اللغة صناعة بشرية', 'أصل اللغة وحي وإلهام من الله ثم تفرّعت عنها القواعد', 'اللغة تطوّرت عشوائياً', 'اللغة توقفت عن التطور'], correctAnswer: 1, explanation: 'المعنى أن أصل اللغة وحي وإلهام من الله تعالى، ثم تفرّعت عنها قواعد النحو والصرف.' },
        ],
      },
    },
    'نصوص': {
      'سهل': {
        title: 'وصف الربيع',
        text: 'أقبل الربيع بأجنحة خضراء، فتفتّحت الأزهار وغنّت الأطيار، وسالَت الجداول بملءِ أنها، وتكسّرت الشمس على صفحة الماء. كأنّ الأرض عروس تزيّنت لعرسها، ووضعت على خدّيها ورداً وياسميناً. فالنسيم يعانق الأغصان، والفراشات ترقص فوق الأزهار، وكلّ شيء يهمس بالحياة والجمال. وقد طُلِعَ الربيع على الدنيا بثوب أخضر ناصع، فأبدع في رسم لوحته الفنية التي تأسر الألباب وتسلب الأفئدة. وفي هذا الفصل المبارك، تستيقظ الطبيعة من سباتها العميق، وتنبض بالحياة من جديد. فالمياه تتدفق في الأنهار والجداول، والحقول تكسوها الخضرة الزاهية. وللربيع في الشعر العربي مكانة خاصة، فقد تغنّى به الشعراء قديماً وحديثاً، واتخذوه رمزاً للأمل والتجدّد والبعث.',
        source: 'محتوى احتياطي',
        questions: [
          { id: 1, text: 'ما الصورة البيانية في قوله "أقبل الربيع بأجنحة"؟', options: ['تشبيه بليغ', 'استعارة مكنية حيث شبّه الربيع بإنسان يأتي بأجنحة', 'كناية عن سرعة الربيع', 'طباق بين الإقبال والأجنحة'], correctAnswer: 1, explanation: 'استعارة مكنية: شبّه الربيع بإنسان يأتي، وحذف المشبّه به وأبقى لازماً وهو أجنحة.' },
          { id: 2, text: 'ما المحسن البديعي في قوله "كأنّ الأرض عروس"؟', options: ['جناس', 'تشبيه تمثيلي', 'طباق', 'سجع'], correctAnswer: 1, explanation: 'تشبيه تمثيلي: شبّه حالة الأرض المتزيّنة بحالة العروس.' },
          { id: 3, text: 'ما نوع الأسلوب في "غنّت الأطيار"؟', options: ['أسلوب خبري حقيقي', 'أسلوب إنشائي طلبي', 'أسلوب خبري لغرض بلاغي', 'أسلوب استفهام'], correctAnswer: 2, explanation: 'أسلوب خبري لغرض بلاغي، فالأطيار لا تغنّي حقيقة بل هو تصوير فني.' },
        ],
      },
      'متوسط': {
        title: 'رثاء الأمجاد',
        text: 'تقولُ العرب قديماً إنّ الدهرَ قُطبُهُ زوالٌ، وإنّ كلَّ شمسٍ لا بدّ أن تغرب. فما أطالَ عمرَ مجدٍ قومٌ إلّا وكانَ أفولهُ قابَ قوسينِ أو أدنى. وهذا حالُ الحضاراتِ جميعاً: تُشرقُ شمسمُها يوماً فتبهرُ العيون، ثمّ يأخذُ الغروبُ بأيديها رويداً رويداً حتّى تتوارى خلفَ الأفق. وللعربِ في البكاءِ على الأطلالِ مذهبٌ فريدٌ، فليسَ هو بكاءَ الضعفِ واليأسِ، بل هو تأمّلٌ في سنّةِ اللهِ في الكونِ واعتبارٌ بما كان. كما قالَ المتنبي: على قدرِ أهلِ العزمِ تأتي العزائمُ وتأتي على قدرِ الكرامِ المكارمُ',
        source: 'محتوى احتياطي',
        questions: [
          { id: 1, text: 'ما الصورة البيانية في "الدهر قطبه زوال"؟', options: ['تشبيه مجمل', 'استعارة تصريحية', 'كناية عن دوام التغيّر', 'استعارة مكنية شبّه الدهر بإنسان له قطب'], correctAnswer: 3, explanation: 'استعارة مكنية: شبّه الدهر بإنسان له قطب وحذف المشبّه به وأبقى لازماً.' },
          { id: 2, text: 'ما نوع الاستعارة في "تأخذ الغروب بأيديها"؟', options: ['استعارة تصريحية', 'استعارة مكنية شبّهت الغروب بإنسان يأخذ بيده', 'تشبيه تمثيلي', 'كناية'], correctAnswer: 1, explanation: 'استعارة مكنية: شبّهت الغروب بإنسان يأخذ بالأيدي.' },
          { id: 3, text: 'ما الغرض البلاغي من بكاء العرب على الأطلال؟', options: ['التعبير عن الحزن والضعف', 'التأمّل في سنّة الله والاعتبار', 'التحسر على الماضي', 'إظهار البلاغة اللفظية'], correctAnswer: 1, explanation: 'ذكر النص أنه تأمّل في سنّة الله في الكون واعتبار بما كان.' },
          { id: 4, text: 'ما علاقة بيت المتنبي بموضوع النص؟', options: ['لا علاقة بينهما', 'تأكيد أن العزائم تتناسب مع العزم', 'تأكيد أن المجد يزول', 'مقارنة بين العرب والعجم'], correctAnswer: 1, explanation: 'البيت يؤكد أن العزائم تأتي على قدر همة أهلها.' },
          { id: 5, text: 'ما الإيقاع الموسيقي في عبارة "رويداً رويداً"؟', options: ['سجع', 'تكرار لغرض التوكيد والتأنّي', 'جناس تام', 'طباق إيجابي'], correctAnswer: 1, explanation: 'تكرار لفظ رويداً يُفيد التوكيد ويُوحى بالبطء التدريجي.' },
        ],
      },
      'صعب': {
        title: 'جدلية الأصالة والمعاصرة في الأدب العربي',
        text: 'يمثل الصراع بين الأصالة والمعاصرة أحد أعمق الإشكاليات التي عاشها الأدب العربي الحديث، وهو صراع يتجاوز المسألة الفنية ليصل إلى جوهر الهوية الثقافية وطبيعة الانتماء الحضاري. يقول أدونيس في كتابه "ثابت والمتحول": "لا نهضة حقيقية بلا قطيعة مع الماضي"، داعياً إلى القطيعة الإبستمولوجية مع التراث كشرط للحداثة. بينما يردّ عليه عبد الوهاب المسيري بأن "القطيعة مع الماضي ليست حداثة بل هي فقدان للهوية"، معتبراً أن الأصالة ليست جموداً بل هي الجذور التي تنمو منها الفروع. وقد تجلّى هذا الصراع بشكل ملموس في شعر التفعيلة، إذ رأى المحافظون أنه انحراف عن عمود الشعر العربي، بينما اعتبره الروّاد تجديداً يحافظ على الروح ويطور القالب. كما قال نزار قباني: خبّئوا أقلامكم... واتركوا الشعر لمن يملكون شجاعة الكلمة',
        source: 'محتوى احتياطي',
        questions: [
          { id: 1, text: 'ما الإشكالية الجوهرية التي يطرحها النص؟', options: ['تخلف الأدب العربي', 'الصراع بين الأصالة والمعاصرة', 'غياب النقد الأدبي', 'ضعف الترجمة'], correctAnswer: 1, explanation: 'النص يطرح الصراع بين الأصالة والمعاصرة كإشكالية تتعدى الفن إلى الهوية.' },
          { id: 2, text: 'ما المقصود بـ"القطيعة الإبستمولوجية" في طرح أدونيس؟', options: ['قطيعة سياسية', 'انقطاع معرفي جذري مع التراث كشرط للحداثة', 'قطيعة جغرافية', 'انقطاع لغوي'], correctAnswer: 1, explanation: 'القطيعة الإبستمولوجية تعني انقطاعاً معرفياً جذرياً على مستوى بنية التفكير.' },
          { id: 3, text: 'ما الأسلوب البلاغي في عبارة أدونيس "لا نهضة حقيقية بلا قطيعة"؟', options: ['أسلوب قصر بالنفي والاستثناء', 'أسلوب استفهام', 'أسلوب نداء', 'أسلوب شرط'], correctAnswer: 0, explanation: 'أسلوب قصر: يقصر النهضة على القطيعة باستخدام النفي ثم الاستثناء.' },
          { id: 4, text: 'كيف يُفهم ردّ المسيري على أدونيس؟', options: ['المسيري يوافق أدونيس', 'المسيري يرى الأصالة جموداً', 'المسيري يرى الأصالة جذوراً تنمو منها الفروع وليست جموداً', 'المسيري يرفض التراث'], correctAnswer: 2, explanation: 'المسيري يرى أن الأصالة ليست جموداً بل هي الجذور التي تنمو منها الفروع.' },
          { id: 5, text: 'ما الصورة البيانية في عبارة المسيري "الجذور التي تنمو منها الفروع"؟', options: ['تشبيه مجمل', 'استعارة مكنية شبّه الأصالة بالجذور والمعاصرة بالفروع', 'كناية عن القدم', 'جناس'], correctAnswer: 1, explanation: 'استعارة مكنية تُصوّر الأصالة كجذور والتجديد كفروع.' },
          { id: 6, text: 'ما موقف المحافظين من شعر التفعيلة؟', options: ['يرونه تجديداً محموداً', 'يرونه انحرافاً عن عمود الشعر العربي', 'لا يرون فيه بأساً', 'يقبله بشرط المحافظة على القافية'], correctAnswer: 1, explanation: 'ذكر النص أن المحافظين رأوا أنه انحراف عن عمود الشعر العربي.' },
          { id: 7, text: 'ما الغرض البلاغي من نداء نزار قباني "خبّئوا أقلامكم"؟', options: ['التحقير', 'التحدي والإثارة والتعبير عن جرأة الكلمة', 'الرثاء', 'التعجب'], correctAnswer: 1, explanation: 'النداء يفيد التحدي والإثارة، فالشعر الحقيقي يحتاج إلى شجاعة.' },
        ],
      },
    },
  }

  // ─── fetchGameContent ──────────────────────────────────────────────────────

  async function fetchGameContent(gameType, difficulty, roomCode, playerNames, previousTopics) {
    // Emit real progress: searching for inspiration
    io.to(roomCode).emit('content-progress', { step: 'searching', text: 'جاري البحث عن مصادر إلهام...' })

    // Emit progress: generating content after search
    io.to(roomCode).emit('content-progress', { step: 'generating', text: 'جاري توليد المحتوى بالذكاء الاصطناعي...' })

    // Emit progress: preparing before fetch
    io.to(roomCode).emit('content-progress', { step: 'preparing', text: 'جاري تجهيز الساحة...' })

    // Create an AbortController with 30 second timeout for the entire content generation
    // (reduced from 40s to avoid long waits; fallback content is always available)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch('http://localhost:3000/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameType, difficulty, playerNames, previousTopics }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Content generation API returned ${response.status}`)
      }

      const data = await response.json()
      if (!data.content) {
        throw new Error('No content in API response')
      }
      return data.content
    } catch (err) {
      clearTimeout(timeout)
      if (err.name === 'AbortError') {
        console.error(`[fetchGameContent] Timeout after 30s for room ${roomCode}, using fallback`)
      } else {
        console.error(`[fetchGameContent] Error for room ${roomCode}:`, err.message)
      }
      // Use fallback content instead of failing - this should always be available
      const fallback = fallbackContent[gameType]?.[difficulty]
      if (fallback) {
        console.log(`[fetchGameContent] Using fallback content for ${gameType}/${difficulty}`)
        return fallback
      }
      // Last resort: try to return any fallback content
      for (const gt of Object.keys(fallbackContent)) {
        for (const diff of Object.keys(fallbackContent[gt])) {
          console.log(`[fetchGameContent] Last resort fallback: ${gt}/${diff}`)
          return fallbackContent[gt][diff]
        }
      }
      // This should never happen, but just in case
      throw new Error('Failed to generate content and no fallback available')
    }
  }

  // ─── broadcastPublicRooms ───────────────────────────────────────────────────

  function broadcastPublicRooms() {
    const list = getPublicRoomsList()
    io.emit('public-rooms-update', { rooms: list })
  }

  // ─── deleteRoom ─────────────────────────────────────────────────────────────

  function deleteRoom(roomCode) {
    const room = rooms.get(roomCode)
    if (!room) return

    for (const [socketId, code] of socketRoomMap.entries()) {
      if (code === roomCode) {
        socketRoomMap.delete(socketId)
      }
    }

    rooms.delete(roomCode)
    console.log(`[delete-room] Room ${roomCode} deleted`)
    broadcastPublicRooms()
  }

  // ─── calculateRoundScores ───────────────────────────────────────────────────

  function calculateRoundScores(room, roundIndex) {
    const scores = []

    for (const [playerId, player] of room.players.entries()) {
      const playerRoundsAnswers = room.playerAnswers.get(playerId)
      const roundAnswers = playerRoundsAnswers?.get(roundIndex)
      const roundContent = room.rounds[roundIndex]

      let roundScore = 0
      let correctAnswers = 0
      const totalQuestions = roundContent?.content.questions.length || 0

      if (roundAnswers && roundContent) {
        for (const [qIndex, answer] of roundAnswers.entries()) {
          const question = roundContent.content.questions[qIndex]
          if (question) {
            const isCorrect = question.correctAnswer === answer.answerIndex
            const points = calculateScore(isCorrect, answer.timeTaken, room.roundTimerSeconds)
            roundScore += points
            if (isCorrect) correctAnswers++
          }
        }
      }

      scores.push({
        playerId,
        playerName: player.name,
        score: roundScore,
        correctAnswers,
        totalQuestions,
      })
    }

    return scores.sort((a, b) => b.score - a.score)
  }

  // ─── removePlayerFromRoom ───────────────────────────────────────────────────

  function removePlayerFromRoom(socketId, reason) {
    const roomCode = socketRoomMap.get(socketId)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room) {
      socketRoomMap.delete(socketId)
      return
    }

    const player = room.players.get(socketId)
    const playerName = player?.name || socketId

    // Remove player entirely
    room.players.delete(socketId)
    room.playerAnswers.delete(socketId)
    socketRoomMap.delete(socketId)

    // If room is now empty, delete it immediately
    if (room.players.size === 0) {
      deleteRoom(roomCode)
      console.log(`[removePlayer] ${playerName} left room ${roomCode}. Room deleted (empty).`)
      return
    }

    // If the removed player was the host, transfer host to the earliest remaining player
    if (room.hostId === socketId) {
      const newHost = findNextHost(room.players)
      if (newHost) {
        room.hostId = newHost.id
        room.hostName = newHost.name
        newHost.isHost = true
        io.to(roomCode).emit('host-changed', {
          newHostId: newHost.id,
          newHostName: newHost.name,
          oldHostName: playerName,
          players: playersToArray(room.players),
        })
      }
    }

    // Notify remaining players
    if (reason === 'leave') {
      io.to(roomCode).emit('player-left', {
        playerId: socketId,
        playerName,
        players: playersToArray(room.players),
      })
    } else {
      io.to(roomCode).emit('player-disconnected', {
        playerId: socketId,
        playerName,
        players: playersToArray(room.players),
      })
    }

    console.log(`[removePlayer] ${playerName} ${reason === 'leave' ? 'left' : 'disconnected from'} room ${roomCode}. Remaining: ${room.players.size}`)

    broadcastPublicRooms()
  }

  // ─── Round Management ───────────────────────────────────────────────────────

  async function generateRemainingRounds(roomCode, totalRounds, gameType, difficulty, playerNames) {
    const room = rooms.get(roomCode)
    if (!room) return

    for (let i = 1; i < totalRounds; i++) {
      try {
        const previousTopics = room.rounds
          .filter(r => r.content?.title)
          .map(r => r.content.title)

        const content = await fetchGameContent(gameType, difficulty, roomCode, playerNames, previousTopics)
        if (!rooms.has(roomCode)) return // Room was deleted

        room.rounds.push({
          roundNumber: i,
          content,
        })
        console.log(`[generateRemainingRounds] Generated round ${i + 1} content for room ${roomCode}`)
      } catch (err) {
        console.error(`[generateRemainingRounds] Failed to generate round ${i + 1} for room ${roomCode}:`, err)
      }
    }
  }

  function handleRoundEnd(roomCode) {
    const room = rooms.get(roomCode)
    if (!room || room.status !== 'playing') return

    const currentRound = room.currentRound
    const totalRounds = room.settings.numberOfRounds

    // Calculate per-round scores (not cumulative)
    const roundScores = calculateRoundScores(room, currentRound)
    room.roundResults.set(currentRound, roundScores)

    // Determine round winner (player with highest score in this round)
    if (roundScores.length > 0) {
      const winnerId = roundScores[0].playerId
      room.roundWinners.set(currentRound, winnerId)

      // Update player's roundWins count
      const winnerPlayer = room.players.get(winnerId)
      if (winnerPlayer) {
        winnerPlayer.roundWins++
      }
    }

    // Reset all player scores for the next round (scores are per-round, not cumulative)
    for (const player of room.players.values()) {
      player.score = 0
    }

    // Check if this was the last round
    if (currentRound >= totalRounds - 1) {
      // Game over! Send round-end first, then game-ended
      io.to(roomCode).emit('round-end', {
        roundNumber: currentRound,
        totalRounds,
        roundScores,
        roundWinner: roundScores[0] || null,
        isLastRound: true,
      })

      // Small delay before showing final results
      setTimeout(() => {
        handleGameEnd(roomCode)
      }, 3000)
      return
    }

    // Send round-end event with scores
    io.to(roomCode).emit('round-end', {
      roundNumber: currentRound,
      totalRounds,
      roundScores,
      roundWinner: roundScores[0] || null,
      isLastRound: false,
    })

    // Move to next round after a brief delay for showing round results
    setTimeout(() => {
      const r = rooms.get(roomCode)
      if (!r || r.status !== 'playing') return

      r.currentRound = currentRound + 1

      // Check if next round content is ready
      const nextRound = r.rounds[r.currentRound]
      if (!nextRound) {
        // Content not ready yet, show loading
        console.log(`[handleRoundEnd] Round ${r.currentRound + 1} content not ready for room ${roomCode}, waiting...`)
        io.to(roomCode).emit('round-loading', {
          roundNumber: r.currentRound,
          totalRounds,
        })

        // Poll for content
        const checkInterval = setInterval(() => {
          const rr = rooms.get(roomCode)
          if (!rr || rr.status !== 'playing') {
            clearInterval(checkInterval)
            return
          }
          const nextR = rr.rounds[rr.currentRound]
          if (nextR) {
            clearInterval(checkInterval)
            rr.roundStartTime = Date.now()
            rr.roundTimerSeconds = rr.settings.timePerRound * 60
            io.to(roomCode).emit('round-start', {
              roundNumber: rr.currentRound,
              totalRounds: rr.settings.numberOfRounds,
              content: nextR.content,
              timePerRound: rr.roundTimerSeconds,
            })
            console.log(`[handleRoundEnd] Delayed round ${rr.currentRound + 1} started in room ${roomCode}`)
          }
        }, 2000)

        return
      }

      // Start next round
      r.roundStartTime = Date.now()
      r.roundTimerSeconds = r.settings.timePerRound * 60

      io.to(roomCode).emit('round-start', {
        roundNumber: r.currentRound,
        totalRounds,
        content: nextRound.content,
        timePerRound: r.roundTimerSeconds,
      })

      console.log(`[handleRoundEnd] Round ${r.currentRound + 1} started in room ${roomCode}. Timer: ${r.roundTimerSeconds}s`)
    }, 5000) // 5 second delay between rounds to show round results
  }

  function handleGameEnd(roomCode) {
    const room = rooms.get(roomCode)
    if (!room) return

    room.status = 'finished'

    // Determine overall winner by round wins (not cumulative score)
    const finalResults = playersToArray(room.players)
      .sort((a, b) => b.roundWins - a.roundWins)

    // The "score" field now represents roundWins for the final results
    const scoresWithWins = finalResults.map(p => ({
      ...p,
      score: p.roundWins, // Override score with roundWins for the leaderboard
    }))

    io.to(roomCode).emit('game-ended', {
      scores: scoresWithWins,
      roundWinners: Object.fromEntries(room.roundWinners),
      roundResults: Object.fromEntries(
        Array.from(room.roundResults.entries()).map(([k, v]) => [k, v])
      ),
      totalRounds: room.settings.numberOfRounds,
    })

    console.log(`[handleGameEnd] Game ended in room ${roomCode}. Winner: ${finalResults[0]?.name} (${finalResults[0]?.roundWins} round wins)`)
    broadcastPublicRooms()
  }

  // ─── Socket.IO Connection Handler ───────────────────────────────────────────

  io.on('connection', (socket) => {
    console.log(`[connected] ${socket.id}`)

    // Send current public rooms list on connect
    socket.emit('public-rooms-update', { rooms: getPublicRoomsList() })

    // ── get-public-rooms ─────────────────────────────────────────────────
    socket.on('get-public-rooms', () => {
      socket.emit('public-rooms-update', { rooms: getPublicRoomsList() })
    })

    // ── rejoin-room ──────────────────────────────────────────────────────
    socket.on('rejoin-room', (data) => {
      const { roomCode, playerName } = data

      if (!roomCode || !playerName) {
        socket.emit('rejoin-failed', { message: 'بيانات النظام غير كاملة' })
        return
      }

      const room = rooms.get(roomCode.toUpperCase())
      if (!room) {
        socket.emit('rejoin-failed', { message: 'الغرفة لم تعد موجودة' })
        return
      }

      // Find the player by name in the room
      let existingPlayer
      let existingPlayerId
      for (const [id, player] of room.players.entries()) {
        if (player.name === playerName.trim()) {
          existingPlayer = player
          existingPlayerId = id
          break
        }
      }

      if (!existingPlayer || !existingPlayerId) {
        socket.emit('rejoin-failed', { message: 'أنت لست في هذه الغرفة' })
        return
      }

      // Update the player's ID to the new socket ID
      const oldId = existingPlayerId
      existingPlayer.id = socket.id

      // Move from old key to new key in players map
      room.players.delete(oldId)
      room.players.set(socket.id, existingPlayer)

      // Move answers too
      const oldAnswers = room.playerAnswers.get(oldId)
      if (oldAnswers) {
        room.playerAnswers.delete(oldId)
        room.playerAnswers.set(socket.id, oldAnswers)
      }

      // Update host ID if needed
      if (room.hostId === oldId) {
        room.hostId = socket.id
      }

      // Set up new socket mapping
      socketRoomMap.set(socket.id, roomCode)
      socket.join(roomCode)

      // Send the full room/game state to the rejoining player
      const rejoinData = {
        roomCode,
        players: playersToArray(room.players),
        settings: room.settings,
        roomType: room.roomType,
        hasPassword: !!room.password,
        isHost: existingPlayer.isHost,
        status: room.status,
        currentRound: room.currentRound,
      }

      // If game is in progress, send current round content and progress
      if (room.status === 'playing' && room.rounds.length > 0) {
        const currentRoundContent = room.rounds[room.currentRound]
        if (currentRoundContent) {
          rejoinData.gameContent = currentRoundContent.content
          rejoinData.currentRound = room.currentRound
          rejoinData.totalRounds = room.settings.numberOfRounds
          rejoinData.answers = {}
          const playerAnswersForRounds = room.playerAnswers.get(socket.id)
          if (playerAnswersForRounds) {
            const roundAnswers = playerAnswersForRounds.get(room.currentRound)
            if (roundAnswers) {
              for (const [qIndex, answer] of roundAnswers.entries()) {
                rejoinData.answers[qIndex] = answer.answerIndex
              }
            }
          }
          // Calculate remaining time
          if (room.roundStartTime) {
            const elapsed = Math.floor((Date.now() - room.roundStartTime) / 1000)
            rejoinData.timeLeft = Math.max(0, room.roundTimerSeconds - elapsed)
          }
        }
      }

      // If game is finished, send final results
      if (room.status === 'finished') {
        const finalScores = playersToArray(room.players).sort((a, b) => b.score - a.score)
        rejoinData.scores = finalScores
        rejoinData.totalRounds = room.settings.numberOfRounds
        rejoinData.roundWinners = Object.fromEntries(room.roundWinners)
        rejoinData.roundResults = Object.fromEntries(
          Array.from(room.roundResults.entries()).map(([k, v]) => [k, v])
        )
      }

      socket.emit('rejoin-success', rejoinData)

      // Notify other players that this player reconnected
      socket.to(roomCode).emit('player-reconnected', {
        playerId: socket.id,
        playerName: existingPlayer.name,
        players: playersToArray(room.players),
      })

      broadcastPublicRooms()

      console.log(`[rejoin-room] ${playerName} (${socket.id}) rejoined room ${roomCode} (was ${oldId})`)
    })

    // ── leave-room ───────────────────────────────────────────────────────
    socket.on('leave-room', () => {
      const roomCode = socketRoomMap.get(socket.id)
      if (!roomCode) return

      // Leave the Socket.io room FIRST so they don't receive any more events
      socket.leave(roomCode)
      removePlayerFromRoom(socket.id, 'leave')
    })

    // ── create-game ──────────────────────────────────────────────────────
    socket.on('create-game', (data) => {
      const { playerName, settings, roomType, password } = data

      if (!playerName || playerName.trim().length === 0) {
        socket.emit('game-error', { message: 'اسم اللاعب مطلوب' })
        return
      }

      // Validate rounds rule: 2 players can't play 2 rounds, 3 players can't play 3 rounds
      if ((settings.maxPlayers === 2 && settings.numberOfRounds === 2) || (settings.maxPlayers === 3 && settings.numberOfRounds === 3)) {
        socket.emit('game-error', { message: 'عدد الجولات لا يمكن أن يساوي عدد اللاعبين عند 2 أو 3 لاعبين' })
        return
      }

      // Cap rounds at 20
      if (settings.numberOfRounds > 20) {
        settings.numberOfRounds = 20
      }

      const roomCode = generateRoomCode()

      const player = {
        id: socket.id,
        name: playerName.trim(),
        score: 0,
        isHost: true,
        isReady: true,
        joinOrder: globalJoinCounter++,
        roundWins: 0,
      }

      const playersMap = new Map()
      playersMap.set(socket.id, player)

      const room = {
        roomCode,
        roomType: roomType || 'عامة',
        password: (roomType === 'خاصة' && password?.trim()) ? password.trim() : null,
        hostId: socket.id,
        hostName: playerName.trim(),
        settings,
        players: playersMap,
        rounds: [],
        status: 'waiting',
        currentRound: 0,
        playerAnswers: new Map(),
        roundStartTime: null,
        roundTimerSeconds: settings.timePerRound * 60,
        roundResults: new Map(),
        roundWinners: new Map(),
      }

      rooms.set(roomCode, room)
      socketRoomMap.set(socket.id, roomCode)
      socket.join(roomCode)

      socket.emit('game-created', {
        roomCode,
        roomType: room.roomType,
        hasPassword: !!room.password,
      })

      if (room.roomType === 'عامة') {
        broadcastPublicRooms()
      }

      console.log(`[create-game] Room ${roomCode} (${roomType}${room.password ? ' +password' : ''}) created by ${playerName} (${socket.id})`)
    })

    // ── join-game ────────────────────────────────────────────────────────
    socket.on('join-game', (data) => {
      const { roomCode, playerName, password } = data

      if (!roomCode || !playerName || playerName.trim().length === 0) {
        socket.emit('game-error', { message: 'رمز الغرفة واسم اللاعب مطلوبان' })
        return
      }

      const room = rooms.get(roomCode.toUpperCase())
      if (!room) {
        socket.emit('game-error', { message: 'الغرفة غير موجودة أو تم حذفها' })
        return
      }

      if (room.players.size === 0) {
        socket.emit('game-error', { message: 'الغرفة غير موجودة أو تم حذفها' })
        broadcastPublicRooms()
        return
      }

      if (room.status !== 'waiting') {
        socket.emit('game-error', { message: 'اللعبة قد بدأت بالفعل' })
        return
      }

      if (room.players.size >= room.settings.maxPlayers) {
        socket.emit('game-error', { message: 'الغرفة ممتلئة' })
        return
      }

      // Check password for private rooms
      if (room.password && room.password !== password) {
        socket.emit('game-error', { message: 'كلمة السر غلط' })
        return
      }

      // Check if player name is already taken
      const nameTaken = Array.from(room.players.values()).some(
        (p) => p.name === playerName.trim()
      )
      if (nameTaken) {
        socket.emit('game-error', { message: 'اسم اللاعب مستخدم بالفعل في هذه الغرفة' })
        return
      }

      const player = {
        id: socket.id,
        name: playerName.trim(),
        score: 0,
        isHost: false,
        isReady: false,
        joinOrder: globalJoinCounter++,
        roundWins: 0,
      }

      room.players.set(socket.id, player)
      socketRoomMap.set(socket.id, roomCode)
      socket.join(roomCode)

      // Send game info to the joiner
      socket.emit('game-joined', {
        roomCode,
        players: playersToArray(room.players),
        settings: room.settings,
        roomType: room.roomType,
        hasPassword: !!room.password,
      })

      // Notify others in the room
      socket.to(roomCode).emit('player-joined', {
        player,
        players: playersToArray(room.players),
      })

      broadcastPublicRooms()

      console.log(`[join-game] ${playerName} (${socket.id}) joined room ${roomCode}`)
    })

    // ── start-game ───────────────────────────────────────────────────────
    socket.on('start-game', async (data) => {
      const { roomCode } = data
      const room = rooms.get(roomCode?.toUpperCase())

      console.log(`[start-game] Request from ${socket.id}, roomCode: ${roomCode}, room found: ${!!room}`)

      if (!room) {
        socket.emit('game-error', { message: 'الغرفة غير موجودة' })
        return
      }

      if (room.hostId !== socket.id) {
        socket.emit('game-error', { message: 'فقط المضيف يمكنه بدء اللعبة' })
        return
      }

      if (room.players.size < 2) {
        socket.emit('game-error', { message: 'يجب أن يكون هناك لاعبان على الأقل' })
        return
      }

      if (room.status !== 'waiting') {
        socket.emit('game-error', { message: 'اللعبة قد بدأت بالفعل' })
        return
      }

      // Update room status
      room.status = 'playing'
      room.currentRound = 0

      // Reset all player scores and round wins for the new game
      for (const player of room.players.values()) {
        player.score = 0
        player.roundWins = 0
      }
      room.roundResults.clear()
      room.roundWinners.clear()

      // Notify all players that game is starting
      io.to(roomCode).emit('game-starting', {})
      // Emit first progress step
      io.to(roomCode).emit('content-progress', { step: 'preparing', text: 'جاري تجهيز الساحة...' })

      // Update public rooms (game started, no longer in waiting)
      broadcastPublicRooms()

      // Get player names for content tracking
      const playerNames = playersToArray(room.players).map(p => p.name)

      // Safety timeout: ensure the game never gets permanently stuck on the loading screen
      // If content generation takes more than 45s total, force use fallback content
      const safetyTimeout = setTimeout(() => {
        const r = rooms.get(roomCode)
        if (r && r.status === 'playing' && r.rounds.length === 0) {
          console.error(`[start-game] Safety timeout triggered for room ${roomCode}, forcing fallback content`)
          // Use fallback content
          let fallback = fallbackContent[r.settings.gameType]?.[r.settings.difficulty]
          if (!fallback) {
            for (const gt of Object.keys(fallbackContent)) {
              for (const diff of Object.keys(fallbackContent[gt])) {
                fallback = fallbackContent[gt][diff]
                break
              }
              if (fallback) break
            }
          }
          if (fallback) {
            r.rounds.push({ roundNumber: 0, content: fallback })
            for (const playerId of r.players.keys()) {
              if (!r.playerAnswers.has(playerId)) {
                r.playerAnswers.set(playerId, new Map())
              }
            }
            r.roundTimerSeconds = r.settings.timePerRound * 60
            r.roundStartTime = Date.now()
            io.to(roomCode).emit('content-progress', { step: 'ready', text: 'استعد للقتال!' })
            io.to(roomCode).emit('round-start', {
              roundNumber: 0,
              totalRounds: r.settings.numberOfRounds,
              content: fallback,
              timePerRound: r.roundTimerSeconds,
            })
          }
        }
      }, 45000)

      // Generate content for all rounds
      try {
        // Generate first round content
        console.log(`[start-game] Generating first round content for room ${roomCode}...`)
        io.to(roomCode).emit('content-progress', { step: 'generating', text: 'جاري توليد الأسئلة والمحتوى...' })

        const firstRoundContent = await fetchGameContent(
          room.settings.gameType,
          room.settings.difficulty,
          roomCode,
          playerNames,
          [] // No previous topics for first round
        )
        room.rounds.push({
          roundNumber: 0,
          content: firstRoundContent,
        })

        // Initialize answer maps for all players
        for (const playerId of room.players.keys()) {
          if (!room.playerAnswers.has(playerId)) {
            room.playerAnswers.set(playerId, new Map())
          }
        }

        // Set round timer
        room.roundTimerSeconds = room.settings.timePerRound * 60
        room.roundStartTime = Date.now()

        // Emit ready progress
        io.to(roomCode).emit('content-progress', { step: 'ready', text: 'استعد للقتال!' })

        // Send first round content to all players
        io.to(roomCode).emit('round-start', {
          roundNumber: 0,
          totalRounds: room.settings.numberOfRounds,
          content: firstRoundContent,
          timePerRound: room.roundTimerSeconds,
        })

        console.log(`[start-game] Round 1 content sent to room ${roomCode}. Timer: ${room.roundTimerSeconds}s`)

        // Pre-generate remaining rounds in the background
        generateRemainingRounds(roomCode, room.settings.numberOfRounds, room.settings.gameType, room.settings.difficulty, playerNames)
        // Clear safety timeout since content was generated successfully
        clearTimeout(safetyTimeout)
      } catch (err) {
        console.error(`[start-game] Failed to generate content for room ${roomCode}:`, err)
        clearTimeout(safetyTimeout)
        room.status = 'waiting'
        room.rounds = []
        io.to(roomCode).emit('game-error', {
          message: 'فشل في توليد محتوى اللعبة. يرجى المحاولة مرة أخرى.',
        })
        broadcastPublicRooms()
      }
    })

    // ── submit-answer ────────────────────────────────────────────────────
    socket.on('submit-answer', (data) => {
      const { roomCode, roundNumber, questionIndex, answerIndex, timeTaken } = data
      const room = rooms.get(roomCode?.toUpperCase())

      if (!room) {
        socket.emit('game-error', { message: 'الغرفة غير موجودة' })
        return
      }

      if (room.status !== 'playing') {
        socket.emit('game-error', { message: 'اللعبة ليست قيد التشغيل' })
        return
      }

      const player = room.players.get(socket.id)
      if (!player) {
        socket.emit('game-error', { message: 'أنت لست في هذه الغرفة' })
        return
      }

      // Make sure we're on the right round
      if (roundNumber !== room.currentRound) {
        return // Ignore answers for wrong rounds
      }

      const roundContent = room.rounds[roundNumber]
      if (!roundContent) return

      // Get or create the player's answer maps
      let playerRoundsAnswers = room.playerAnswers.get(socket.id)
      if (!playerRoundsAnswers) {
        playerRoundsAnswers = new Map()
        room.playerAnswers.set(socket.id, playerRoundsAnswers)
      }

      let roundAnswers = playerRoundsAnswers.get(roundNumber)
      if (!roundAnswers) {
        roundAnswers = new Map()
        playerRoundsAnswers.set(roundNumber, roundAnswers)
      }

      // Prevent duplicate answers for the same question
      if (roundAnswers.has(questionIndex)) {
        return
      }

      // Record the answer
      roundAnswers.set(questionIndex, { answerIndex, timeTaken })

      // Calculate score for this answer (per-round score, not cumulative)
      const question = roundContent.content.questions[questionIndex]
      if (question) {
        const isCorrect = question.correctAnswer === answerIndex
        const points = calculateScore(
          isCorrect,
          timeTaken,
          room.roundTimerSeconds
        )
        player.score += points
      }

      // Check if this player has answered all questions in this round
      const totalQuestions = roundContent.content.questions.length
      const playerAnsweredAll = roundAnswers.size >= totalQuestions

      // Notify the player of their answer status
      socket.emit('answer-confirmed', {
        questionIndex,
        answerIndex,
        roundNumber,
        playerAnsweredAll,
      })

      // Check if ALL players have answered all questions in this round
      const allPlayersAnsweredAll = Array.from(room.players.keys()).every((playerId) => {
        const pAnswers = room.playerAnswers.get(playerId)
        if (!pAnswers) return false
        const rAnswers = pAnswers.get(roundNumber)
        if (!rAnswers) return false
        return rAnswers.size >= totalQuestions
      })

      if (allPlayersAnsweredAll) {
        // All players finished this round
        handleRoundEnd(roomCode)
      }
    })

    // ── round-time-up ────────────────────────────────────────────────────
    socket.on('round-time-up', (data) => {
      const { roomCode, roundNumber } = data
      const room = rooms.get(roomCode?.toUpperCase())
      if (!room || room.status !== 'playing') return
      if (roundNumber !== room.currentRound) return

      // Check if round time has actually expired
      if (room.roundStartTime) {
        const elapsed = Math.floor((Date.now() - room.roundStartTime) / 1000)
        if (elapsed >= room.roundTimerSeconds - 2) { // Allow 2s buffer for network delay
          handleRoundEnd(roomCode)
        }
      }
    })

    // ── surrender ────────────────────────────────────────────────────────
    socket.on('surrender', () => {
      const roomCode = socketRoomMap.get(socket.id)
      if (!roomCode) return

      const room = rooms.get(roomCode)
      if (!room) return

      const player = room.players.get(socket.id)
      const playerName = player?.name || socket.id

      // Leave the socket.io room
      socket.leave(roomCode)
      removePlayerFromRoom(socket.id, 'leave')

      // Notify the player that they successfully surrendered
      socket.emit('surrender-confirmed', { roomCode })

      // If game is playing and only 1 player left, auto-end the game
      const updatedRoom = rooms.get(roomCode)
      if (updatedRoom && updatedRoom.status === 'playing' && updatedRoom.players.size === 1) {
        // Notify the remaining player that they won because the opponent left
        const remainingPlayer = Array.from(updatedRoom.players.values())[0]
        io.to(roomCode).emit('opponent-left-game', {
          leftPlayerName: playerName,
          winnerName: remainingPlayer?.name,
        })
        // End the game immediately
        handleGameEnd(roomCode)
      } else if (updatedRoom && updatedRoom.status === 'playing' && updatedRoom.players.size === 0) {
        deleteRoom(roomCode)
      }
    })

    // ── disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const roomCode = socketRoomMap.get(socket.id)
      if (!roomCode) {
        console.log(`[disconnect] ${socket.id} (not in any room)`)
        return
      }

      // Get player name BEFORE removing them
      const room = rooms.get(roomCode)
      const player = room?.players.get(socket.id)
      const disconnectedPlayerName = player?.name || socket.id

      console.log(`[disconnect] ${socket.id} disconnected from room ${roomCode}`)

      // Leave the socket.io room
      socket.leave(roomCode)

      // Remove player immediately - no grace period
      removePlayerFromRoom(socket.id, 'disconnect')

      // If game is playing and only 1 player left, notify them and auto-end the game
      const updatedRoom = rooms.get(roomCode)
      if (updatedRoom && updatedRoom.status === 'playing' && updatedRoom.players.size === 1) {
        const remainingPlayer = Array.from(updatedRoom.players.values())[0]
        io.to(roomCode).emit('opponent-left-game', {
          leftPlayerName: disconnectedPlayerName,
          winnerName: remainingPlayer?.name,
        })
        // End the game immediately - only one player left
        handleGameEnd(roomCode)
      } else if (updatedRoom && updatedRoom.status === 'playing' && updatedRoom.players.size === 0) {
        // No players left - delete room
        deleteRoom(roomCode)
      }
    })

    socket.on('error', (error) => {
      console.error(`[error] Socket error (${socket.id}):`, error)
    })
  })

  // ─── Start Server ───────────────────────────────────────────────────────────

  httpServer.listen(port, hostname, () => {
    console.log(`> Integrated Server (Next.js + Socket.io) ready on http://${hostname}:${port}`)
    console.log(`> Socket.io path: /socket.io/`)
  })

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal, shutting down server...')
    httpServer.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })

  process.on('SIGINT', () => {
    console.log('Received SIGINT signal, shutting down server...')
    httpServer.close(() => {
      console.log('Server closed')
      process.exit(0)
    })
  })
})
