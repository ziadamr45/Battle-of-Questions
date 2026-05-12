# Worklog

---
Task ID: 0
Agent: Main Coordinator
Task: Initialize worklog and plan implementation

Work Log:
- Read and analyzed game-service/index.ts (Socket.IO server, team logic, AI content generation)
- Read and analyzed src/app/page.tsx (main game page with all screens)
- Read and analyzed src/lib/game-store.ts (Zustand store)
- Read and analyzed src/app/api/generate-content/route.ts (API route for content generation)
- Identified team bug: when joining team mode, players start unassigned and must manually request to join a team. The auto-assign only works if the empty team has NO members at all - but the UX requires clicking a button which may not be intuitive
- Identified النصوص mode issue: the AI prompt only slightly differentiates from القراءة المتحررة (just a typeFocus line about rhetoric), still generates reading comprehension passages instead of literary/poetic content
- Leader transfer already exists for team mode (captain transfer) and host transfer, but solo mode needs visible transfer UI

Stage Summary:
- Team bug: Need auto-assign on join for empty teams + better UX
- النصوص mode: Complete prompt overhaul needed for literary/poetic/rhetorical content
- Leader transfer: Need UI addition in solo mode

---
Task ID: 1
Agent: Backend Team Fix Agent
Task: Fix team auto-assign on join + verify leader transfer in solo mode

Work Log:
- Read worklog.md and game-service/index.ts
- **Bug Fix: Auto-assign to empty team on join (lines 1784-1797)**
  - When a player joins a team mode room (battleMode === 'فرق'), the code now checks if Team A or Team B is empty
  - If Team A is empty → auto-assign player to Team A as captain
  - If Team B is empty → auto-assign player to Team B as captain
  - If both teams have members → player stays unassigned (existing behavior)
  - This happens BEFORE room.players.set() so the player object is already in the correct state
- **Bug Fix: Emit team events when auto-assigned (lines 1828-1854)**
  - After the joiner receives game-joined and others receive player-joined, if the player was auto-assigned:
    - Emit 'team-update' to the whole room (so UI shows correct team assignments)
    - Emit 'join-request-approved' to the auto-assigned player (so they see they're on a team)
    - Emit 'team-captain-changed' to the whole room (so UI shows them as captain)
- **Verification: transfer-leadership in solo mode**
  - Reviewed the transfer-leadership handler (lines 3641-3745)
  - The host type transfer already works for both solo and team modes - no battleMode guard exists
  - The comment already says "or a host to transfer host role to another player (both solo and team modes)"
  - No code changes needed for this feature
- Restarted game service, verified health endpoint returns OK

Stage Summary:
- Team auto-assign bug: FIXED - players are now automatically assigned to empty teams on join
- Leader transfer in solo mode: VERIFIED WORKING - no code changes needed, backend already supports it
- The UI side for solo mode leader transfer is handled by the frontend team

---
Task ID: 2
Agent: Frontend Leader Transfer Agent
Task: Add Leader Transfer UI in Solo Mode

Work Log:
- Read worklog.md to understand prior work context
- Located solo mode player list in LobbyScreen (line ~3752, "Original solo player list" section)
- Found existing host transfer button at line ~3862 that used Crown icon with amber styling
- This was inconsistent with team mode's Shield icon with violet styling for host transfer
- Replaced the existing Crown/amber host transfer button with Shield/violet styled button matching team mode pattern
- Changes made to `/home/z/my-project/src/app/page.tsx`:
  - Changed trigger button from `<Button size="icon" variant="ghost">` with Crown/amber to `<button>` with Shield/violet-400 styling
  - Changed AlertDialogAction from amber-600 to violet-600 background
  - Changed action button icon from Crown to Shield
  - Updated description text to match team mode pattern (removed extra sentence about not being able to start game)
  - Comment updated from "Host-only: Transfer host button" to "Host transfer button in solo mode"
- Lint check passed with no errors

Stage Summary:
- Solo mode host transfer UI: UPDATED - now uses Shield icon with violet color scheme, consistent with team mode host transfer button
- The button emits `transfer-leadership` with `type: 'host'` which the backend already supports
- The button is only visible when: current user is host AND the target player is not host AND it's not the current user (already wrapped in !isMe check)

---
Task ID: 3
Agent: النصوص Prompt Overhaul Agent (Game Service)
Task: Overhaul النصوص Mode AI Prompts to be fundamentally different from القراءة المتحررة

Work Log:
- Read worklog.md and game-service/index.ts to understand current state
- Identified the core problem: النصوص mode used the same prompt structure as القراءة المتحررة, with only one different line (`typeFocus`)
- **Change 1: Expanded searchQueriesPool['نصوص']** (lines ~604-694)
  - Expanded from 28 entries to 60+ entries
  - Added organized sections: Classical Poetry, Classical Prose, مدرسة الإحياء والبعث, مدرسة الديوان, مدرسة أبوللو, أدب المهجر, الرومانسية, الواقعية, الشعر الحر, الأدب الحديث, بلاغة عربية, محسنات بديعية, أساليب إنشائية, نقد أدبي, موسيقى شعرية, وصف وأدب مكاني, بلاغة قرآنية, فلسفة وتأمل
  - Covers all specified literary schools, poets, and rhetorical topics
- **Change 2: Replaced topicSeeds['نصوص']** (lines ~729-768)
  - Replaced 15 generic seeds with 35+ literary-focused seeds
  - Organized into sections: شعر (poetry prompts), نثر أدبي (literary prose), مقاطع بلاغية (rhetorical passages), نصوص بمدرسة أدبية محددة (specific school prompts), تأملات فلسفية أدبية (philosophical literary)
  - Each seed now specifies literary devices/styles to use (e.g., "باستعارات مكنية", "بتشبيهات مركبة", "بمجاز مرسل وتورية")
- **Change 3: Completely rewrote buildPrompt function** (lines ~803-1080)
  - Added النصوص-specific constants before the function: literaryTypes, literarySchools, nosousWordCounts, nosousQuestionFocus, nosousDifficultyInstructions
  - Function now branches completely for النصوص mode: `if (gameType === 'نصوص') { return ... }`
  - النصوص prompt uses completely different:
    - System identity: "أديب وناقد عربي متمكن" instead of "معلم خبير"
    - Word counts: literary-focused (250-400, 400-650, 600-900)
    - Question focus: exclusively rhetoric/literary (بلاغة، صور بيانية، محسنات بديعية، etc.)
    - Difficulty instructions: literary difficulty scaling (direct → analytical → critical)
    - Text structure instructions: poetry formatting, prose rhythm, literary parts
    - Random literary type and school injection per generation
    - JSON source field: "المدرسة الأدبية أو الشاعر المستلهم منه"
  - القراءة المتحررة mode: UNCHANGED from original code
- **Change 4: Updated LLM system message in fetchGameContent** (lines ~1165-1168)
  - النصوص: "أنت أديب وناقد عربي متمكن، متخصص في الأدب العربي وبلاغته ونقده. تكتب نصوصاً أدبية أصيلة وتُعدّ أسئلة بلاغية وتذوق أدبي."
  - القراءة متحررة: "أنت معلم خبير في اللغة العربية متخصص في إعداد امتحانات القراءة المتحررة والنصوص." (unchanged)
- Game service restarted, health endpoint verified OK
- Lint check passed with no errors

Stage Summary:
- النصوص mode prompt: COMPLETELY OVERHAULED - now generates literary/artistic content (poetry, prose, rhetoric) with rhetoric/literary questions
- The two modes now feel FUNDAMENTALLY DIFFERENT: القراءة المتحررة = comprehension battle, النصوص = literary and rhetorical battle
- Search queries and topic seeds expanded significantly for literary diversity
- No changes to القراءة المتحررة mode

---
Task ID: 4
Agent: النصوص Prompt Overhaul Agent (API Route)
Task: Apply the same النصوص prompt overhaul to the API route file as was done in the game service

Work Log:
- Read worklog.md and game-service/index.ts to understand the النصوص changes made in Task 3
- Read src/app/api/generate-content/route.ts to understand current state
- Identified the core problem: API route's النصوص mode used the same unified prompt as القراءة المتحررة, with only a `typeFocus` line differentiating
- **Change 1: Expanded searchQueriesPool['نصوص']** (lines ~90-180)
  - Expanded from ~43 entries to 75+ entries
  - Added organized sections matching game service: Classical Poetry, Classical Prose, مدرسة الإحياء والبعث, مدرسة الديوان, مدرسة أبوللو, أدب المهجر, الرومانسية, الواقعية, الشعر الحر, الأدب الحديث, بلاغة عربية, محسنات بديعية, أساليب إنشائية, نقد أدبي, موسيقى شعرية, وصف وأدب مكاني, بلاغة قرآنية, فلسفة وتأمل
  - Covers all specified literary schools, poets, and rhetorical topics as game service
- **Change 2: Replaced topicSeeds['نصوص']** (lines ~204-243)
  - Replaced 15 generic seeds with 35+ literary-focused seeds
  - Organized into sections: شعر (poetry prompts), نثر أدبي (literary prose), مقاطع بلاغية (rhetorical passages), نصوص بمدرسة أدبية محددة (specific school prompts), تأملات فلسفية أدبية (philosophical literary)
  - Each seed now specifies literary devices/styles (e.g., "باستعارات مكنية", "بتشبيهات مركبة", "بمجاز مرسل وتورية")
- **Change 3: Added النصوص-specific constants** (lines ~283-352)
  - literaryTypes: 10 literary type options (poetry, prose, rhetorical, etc.)
  - literarySchools: 10 literary school options (الإحياء, الديوان, أبوللو, المهجر, etc.)
  - nosousWordCounts: literary-focused word counts (250-400, 400-650, 600-900)
  - nosousQuestionFocus: exclusively rhetoric/literary question types
  - nosousDifficultyInstructions: literary difficulty scaling (direct → analytical → critical)
- **Change 4: Completely rewrote buildPrompt for النصوص mode** (lines ~387-462)
  - Added early branch: `if (gameType === 'نصوص') { return ... }`
  - النصوص prompt uses completely different:
    - System identity: "أديب وناقد عربي متمكن" instead of "كاتب ومفكر"
    - Word counts: literary-focused via nosousWordCounts
    - Question focus: exclusively rhetoric/literary via nosousQuestionFocus
    - Difficulty instructions: literary via nosousDifficultyInstructions
    - Random literary type and school injection per generation
    - Poetry/prose/rhetorical-specific structure instructions
    - JSON source field: "المدرسة الأدبية أو الشاعر المستلهم منه"
    - No mention of reading comprehension at all
  - القراءة المتحررة mode: UNCHANGED from original code
- **Change 5: Updated system message in generateWithRetry** (lines ~648-651)
  - النصوص: "أنت أديب وناقد عربي متمكن، متخصص في الأدب العربي وبلاغته ونقده. تكتب نصوصاً أدبية أصيلة وتُعدّ أسئلة بلاغية وتذوق أدبي."
  - القراءة متحررة: unchanged (generic writer persona)
- Lint check passed with no errors

Stage Summary:
- API route النصوص mode: COMPLETELY OVERHAULED - matches game service philosophy
- Both code paths (game service + API route) now generate literary/artistic content for النصوص mode
- The two modes feel FUNDAMENTALLY DIFFERENT in both paths: القراءة المتحررة = comprehension battle, النصوص = literary and rhetorical battle
- Search queries and topic seeds expanded significantly for literary diversity
- No changes to القراءة المتحررة mode

---
Task ID: 5
Agent: Main Coordinator (Direct)
Task: Add literary presentation UX for النصوص mode

Work Log:
- Added `isLiteraryMode` flag detection in GameScreen based on `gameSettings.gameType === 'نصوص'`
- Added `isPoetry` detection to identify poetic text (short lines, multiple lines)
- Created `renderLiteraryParagraph` function that:
  - Detects if a paragraph block looks like poetry (short lines, >=2 lines)
  - Renders poetry verses with centered layout, paired hemistichs (شطر/عجز) with ⁂ separator
  - Uses Amiri/Noto Naskh Arabic serif font for literary text
  - Uses warm amber color scheme (amber-200/90 for text) instead of slate for النصوص
  - Renders prose paragraphs with larger line-height (2.3) and amber color
- Updated text container styling:
  - النصوص mode: `bg-gradient-to-b from-amber-950/20` with amber border instead of `battle-card-glow`
  - Added `divide-y divide-amber-500/10` dividers for literary sections
- Updated text header:
  - النصوص mode: ScrollText icon with amber/gold gradient title using Amiri font
  - القراءة المتحررة: unchanged (BookOpen icon with red gradient)
- Updated source label:
  - النصوص mode: "المنهل الأدبي:" in amber-500/50 instead of "المصدر:"
- Updated text/question toggle button:
  - النصوص mode: ScrollText icon with amber-700 active color
  - القراءة المتحررة: unchanged (BookOpen icon with red-600)
- Added game type badge in HUD:
  - النصوص mode: "أدب وبلاغة" badge with ScrollText icon in amber
  - Hidden on mobile (hidden sm:flex) to save space
- Lint check: PASSED

Stage Summary:
- النصوص mode now has distinct literary presentation: poetry formatting, verse spacing, elegant typography, amber color scheme
- Players will instantly FEEL the difference between modes visually
- القراءة المتحررة mode: UNCHANGED
