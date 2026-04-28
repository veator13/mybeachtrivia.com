// mybeachtrivia.com/beachTriviaPages/dashboards/writer/js/block-builder.js
// Writer block builder
// Phase 1:
// - build normalized block objects from question-form data
// - generate preset block structures
// - support single-question blocks and reusable round templates
// - expose helpers for app.js / future Firestore save flows

(function () {
    "use strict";
  
    const BLOCK_BUILDER = {
      init,
      createBlockFromFormData,
      createSingleQuestionBlock,
      createStandardRoundBlock,
      createIntroSlideBlock,
      createCategorySlideBlock,
      createHalftimeBlock,
      createCategoryOfTheDayBlock,
      createFinalQuestionBlock,
      createClosingSlideBlock,
      createFeudQuestionBlock,
      createFeudHalftimeBlock,
      createFeudFinalBlock,
      createBlockByType,
      duplicateBlock,
      createNamedStateList,
      slugify,
    };
  
    window.WriterBlockBuilder = BLOCK_BUILDER;
  
    const DEFAULT_AUTHOR = "writer-user";
    let initialized = false;
  
    function init() {
      initialized = true;
    }
  
    function createBlockFromFormData(formData) {
      const data = normalizeFormData(formData);
      return createBlockByType(data.block.type, data);
    }
  
    function createBlockByType(blockType, formData) {
      const data = normalizeFormData(formData);
      const type = String(blockType || data.block.type || "single-question").trim().toLowerCase();
  
      switch (type) {
        case "single-question":
          return createSingleQuestionBlock(data);
  
        case "standard-round":
          return createStandardRoundBlock(data);
  
        case "intro-slide":
          return createIntroSlideBlock(data);
  
        case "category-slide":
          return createCategorySlideBlock(data);
  
        case "halftime":
          return createHalftimeBlock(data);
  
        case "category-of-the-day":
          return createCategoryOfTheDayBlock(data);
  
        case "final-question":
          return createFinalQuestionBlock(data);
  
        case "closing-slide":
          return createClosingSlideBlock(data);

        case "feud-single-question":
          return createFeudQuestionBlock(data);

        case "feud-halftime":
          return createFeudHalftimeBlock(data);

        case "feud-final":
          return createFeudFinalBlock(data);

        default:
          return createSingleQuestionBlock(data);
      }
    }
  
    function createSingleQuestionBlock(formData) {
      const data = normalizeFormData(formData);
      const roundSlug = slugify(data.block.roundName || "round");
      const categorySlug = slugify(data.block.categoryName || "category");
      const questionNumber = 1;
  
      return baseBlock({
        id: makeId("blk"),
        type: "single-question",
        label: buildSingleQuestionLabel(data),
        roundName: data.block.roundName,
        categoryName: data.block.categoryName,
        questionType: data.block.questionType,
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 1,
        notes: data.block.questionNotes,
        slides: [
          createQuestionSlide({
            stateKey: `${roundSlug}.q${questionNumber}.live`,
            stateLabel: `${data.block.roundName} Question ${questionNumber} Live`,
            mode: "live",
            formData: data,
            questionNumber: questionNumber,
            categorySlug: categorySlug,
          }),
          createQuestionSlide({
            stateKey: `${roundSlug}.q${questionNumber}.reveal`,
            stateLabel: `${data.block.roundName} Question ${questionNumber} Reveal`,
            mode: "reveal",
            formData: data,
            questionNumber: questionNumber,
            categorySlug: categorySlug,
          }),
        ],
        summary: {
          publishReady: false,
          reusable: true,
          templateEligible: true,
        },
      });
    }
  
    function createStandardRoundBlock(formData) {
      const data = normalizeFormData(formData);
      const roundName = data.block.roundName || "Round 1";
      const roundSlug = slugify(roundName);
      const questionCount = 5;
      const slides = [];
  
      slides.push({
        id: makeId("sld"),
        kind: "round-categories",
        stateKey: `${roundSlug}.categories`,
        stateLabel: `${roundName} Categories`,
        audienceMode: "live",
        title: roundName,
        categoryName: data.block.categoryName,
        prompt: `Categories for ${roundName}`,
        notes: data.block.questionNotes || "",
        layout: "categories",
        revealable: false,
      });
  
      for (let i = 1; i <= questionCount; i += 1) {
        slides.push(
          createQuestionSlide({
            stateKey: `${roundSlug}.q${i}.live`,
            stateLabel: `${roundName} Question ${i} Live`,
            mode: "live",
            formData: data,
            questionNumber: i,
            categorySlug: slugify(data.block.categoryName || "category"),
          })
        );
      }
  
      slides.push({
        id: makeId("sld"),
        kind: "turn-in",
        stateKey: `${roundSlug}.turn-in`,
        stateLabel: `${roundName} Turn In Slips`,
        audienceMode: "live",
        title: roundName,
        categoryName: data.block.categoryName,
        prompt: "Turn in your answer slips",
        notes: "Host pacing slide before answer reveal pass.",
        layout: "turn-in",
        revealable: false,
      });
  
      for (let i = 1; i <= questionCount; i += 1) {
        slides.push(
          createQuestionSlide({
            stateKey: `${roundSlug}.q${i}.reveal`,
            stateLabel: `${roundName} Question ${i} Reveal`,
            mode: "reveal",
            formData: data,
            questionNumber: i,
            categorySlug: slugify(data.block.categoryName || "category"),
          })
        );
      }
  
      slides.push({
        id: makeId("sld"),
        kind: "answers-summary",
        stateKey: `${roundSlug}.answers-summary`,
        stateLabel: `${roundName} Answers Summary`,
        audienceMode: "live",
        title: `${roundName} Answers`,
        categoryName: data.block.categoryName,
        prompt: "All answers for the round",
        notes: "Summary slide shown after the repeated reveal pass.",
        layout: "answers-summary",
        revealable: false,
        answers: buildSummaryAnswers(data, questionCount),
      });
  
      return baseBlock({
        id: makeId("blk"),
        type: "standard-round",
        label: `${roundName} • Standard Round`,
        roundName: roundName,
        categoryName: data.block.categoryName,
        questionType: data.block.questionType,
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
        questionCount: questionCount,
        notes: data.block.questionNotes,
        slides: slides,
        summary: {
          publishReady: false,
          reusable: true,
          templateEligible: true,
        },
      });
    }
  
    function createIntroSlideBlock(formData) {
      const data = normalizeFormData(formData);
      return baseBlock({
        id: makeId("blk"),
        type: "intro-slide",
        label: "Intro Slides",
        roundName: "Intro",
        categoryName: data.block.categoryName,
        questionType: "display",
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 0,
        notes: data.block.questionNotes,
        slides: [
          {
            id: makeId("sld"),
            kind: "intro",
            stateKey: "intro.welcome",
            stateLabel: "Intro Welcome",
            audienceMode: "live",
            title: data.show.title || "Trivia Night",
            categoryName: data.block.categoryName || "Welcome",
            prompt: data.block.questionText || "Welcome to tonight's show",
            notes: data.block.questionNotes || "",
            layout: "intro",
            revealable: false,
          },
          {
            id: makeId("sld"),
            kind: "intro",
            stateKey: "intro.house-rules",
            stateLabel: "Intro House Rules",
            audienceMode: "live",
            title: "House Rules",
            categoryName: data.block.categoryName || "Get Ready",
            prompt: data.block.answerText || "Phones away. Answers on slips. Have fun.",
            notes: data.block.questionNotes || "",
            layout: "intro-rules",
            revealable: false,
          },
        ],
        summary: {
          publishReady: false,
          reusable: true,
          templateEligible: true,
        },
      });
    }
  
    function createCategorySlideBlock(formData) {
      const data = normalizeFormData(formData);
      const roundSlug = slugify(data.block.roundName || "round");
  
      return baseBlock({
        id: makeId("blk"),
        type: "category-slide",
        label: `${data.block.roundName || "Round"} • Categories`,
        roundName: data.block.roundName,
        categoryName: data.block.categoryName,
        questionType: "display",
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 0,
        notes: data.block.questionNotes,
        slides: [
          {
            id: makeId("sld"),
            kind: "round-categories",
            stateKey: `${roundSlug}.categories`,
            stateLabel: `${data.block.roundName || "Round"} Categories`,
            audienceMode: "live",
            title: data.block.roundName || "Round",
            categoryName: data.block.categoryName || "Categories",
            prompt: data.block.questionText || "Categories for this round",
            notes: data.block.questionNotes || "",
            layout: "categories",
            revealable: false,
          },
        ],
        summary: {
          publishReady: false,
          reusable: true,
          templateEligible: true,
        },
      });
    }
  
    function createHalftimeBlock(formData) {
      const data = normalizeFormData(formData);
      return baseBlock({
        id: makeId("blk"),
        type: "halftime",
        label: "Halftime",
        roundName: "Halftime",
        categoryName: data.block.categoryName,
        questionType: data.block.questionType,
        themeStyle: data.block.themeStyle || "Special",
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 1,
        notes: data.block.questionNotes,
        slides: [
          {
            id: makeId("sld"),
            kind: "halftime",
            stateKey: "halftime.live",
            stateLabel: "Halftime Live",
            audienceMode: "live",
            title: "Halftime",
            categoryName: data.block.categoryName || "Special Round",
            prompt: data.block.questionText || "Halftime question",
            answer: data.block.answerText || "",
            options: normalizeOptions(data.block.options),
            notes: data.block.questionNotes || "",
            layout: "halftime",
            revealable: true,
          },
          {
            id: makeId("sld"),
            kind: "halftime-answer",
            stateKey: "halftime.reveal",
            stateLabel: "Halftime Reveal",
            audienceMode: "live",
            title: "Halftime Answer",
            categoryName: data.block.categoryName || "Special Round",
            prompt: data.block.questionText || "Halftime question",
            answer: data.block.answerText || "",
            options: normalizeOptions(data.block.options),
            notes: data.block.questionNotes || "",
            layout: "halftime-reveal",
            revealable: false,
          },
        ],
        summary: {
          publishReady: false,
          reusable: true,
          templateEligible: true,
        },
      });
    }
  
    function createCategoryOfTheDayBlock(formData) {
      const data = normalizeFormData(formData);
      return baseBlock({
        id: makeId("blk"),
        type: "category-of-the-day",
        label: "Category of the Day",
        roundName: data.block.roundName || "Category of the Day",
        categoryName: data.block.categoryName || "Category of the Day",
        questionType: data.block.questionType,
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 1,
        notes: data.block.questionNotes,
        slides: [
          {
            id: makeId("sld"),
            kind: "category-of-the-day",
            stateKey: "category-of-the-day.live",
            stateLabel: "Category of the Day Live",
            audienceMode: "live",
            title: data.block.roundName || "Category of the Day",
            categoryName: data.block.categoryName || "Featured Category",
            prompt: data.block.questionText || "Featured category prompt",
            answer: data.block.answerText || "",
            options: normalizeOptions(data.block.options),
            notes: data.block.questionNotes || "",
            layout: "category-of-the-day",
            revealable: true,
          },
        ],
        summary: {
          publishReady: false,
          reusable: true,
          templateEligible: true,
        },
      });
    }
  
    function createFinalQuestionBlock(formData) {
      const data = normalizeFormData(formData);
      return baseBlock({
        id: makeId("blk"),
        type: "final-question",
        label: "Final Question",
        roundName: "Final Question",
        categoryName: data.block.categoryName,
        questionType: data.block.questionType,
        themeStyle: "Final Question",
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 1,
        notes: data.block.questionNotes,
        slides: [
          {
            id: makeId("sld"),
            kind: "final-question",
            stateKey: "final-question.live",
            stateLabel: "Final Question Live",
            audienceMode: "live",
            title: "Final Question",
            categoryName: data.block.categoryName || "Final Category",
            prompt: data.block.questionText || "Final question prompt",
            answer: data.block.answerText || "",
            options: normalizeOptions(data.block.options),
            notes: data.block.questionNotes || "",
            layout: "final-question",
            revealable: true,
          },
          {
            id: makeId("sld"),
            kind: "final-answer",
            stateKey: "final-question.reveal",
            stateLabel: "Final Question Reveal",
            audienceMode: "live",
            title: "Final Answer",
            categoryName: data.block.categoryName || "Final Category",
            prompt: data.block.questionText || "Final question prompt",
            answer: data.block.answerText || "",
            options: normalizeOptions(data.block.options),
            notes: data.block.questionNotes || "",
            layout: "final-answer",
            revealable: false,
          },
        ],
        summary: {
          publishReady: false,
          reusable: true,
          templateEligible: true,
        },
      });
    }
  
    function buildFeudSlides(data, roundSlug, label, introKind) {
      var feudAnswers = normalizeFeudAnswers(data.block.feudAnswers);
      var slides = [];

      if (introKind) {
        slides.push({
          id: makeId("sld"),
          kind: introKind,
          stateKey: roundSlug + ".intro",
          stateLabel: label + " Intro",
          audienceMode: "live",
          title: label,
          categoryName: data.block.categoryName || "",
          prompt: data.block.questionText || (label + " Question"),
          notes: data.block.questionNotes || "",
          layout: introKind,
          revealable: false,
        });
      }

      slides.push({
        id: makeId("sld"),
        kind: "feud-question-live",
        stateKey: roundSlug + ".live",
        stateLabel: label + " Live",
        audienceMode: "live",
        title: data.block.roundName || label,
        categoryName: data.block.categoryName || "",
        questionType: "feud-question",
        prompt: data.block.questionText || "",
        feudAnswers: feudAnswers,
        notes: data.block.questionNotes || "",
        layout: "feud-question-live",
        revealable: true,
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
      });

      slides.push({
        id: makeId("sld"),
        kind: "feud-answer-reveal",
        stateKey: roundSlug + ".reveal",
        stateLabel: label + " Answer Reveal",
        audienceMode: "reveal",
        title: data.block.roundName || label,
        categoryName: data.block.categoryName || "",
        questionType: "feud-question",
        prompt: data.block.questionText || "",
        feudAnswers: feudAnswers,
        notes: data.block.questionNotes || "",
        layout: "feud-answer-reveal",
        revealable: false,
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
      });

      return slides;
    }

    function createFeudQuestionBlock(formData) {
      var data = normalizeFormData(formData);
      var roundSlug = slugify(data.block.roundName || "feud");
      var label = data.block.roundName || "Feud Question";

      return baseBlock({
        id: makeId("blk"),
        type: "feud-single-question",
        label: label + " • " + (data.block.categoryName || "Feud Survey"),
        roundName: data.block.roundName,
        categoryName: data.block.categoryName,
        questionType: "feud-question",
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 1,
        notes: data.block.questionNotes,
        slides: buildFeudSlides(data, roundSlug, label, null),
        summary: { publishReady: false, reusable: true, templateEligible: true },
      });
    }

    function createFeudHalftimeBlock(formData) {
      var data = normalizeFormData(formData);
      var label = "Halftime Feud";

      return baseBlock({
        id: makeId("blk"),
        type: "feud-halftime",
        label: label,
        roundName: "Halftime",
        categoryName: data.block.categoryName,
        questionType: "feud-question",
        themeStyle: data.block.themeStyle || "Special",
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 1,
        notes: data.block.questionNotes,
        slides: buildFeudSlides(data, "feud-halftime", label, "feud-halftime-intro"),
        summary: { publishReady: false, reusable: true, templateEligible: true },
      });
    }

    function createFeudFinalBlock(formData) {
      var data = normalizeFormData(formData);
      var label = "Final Feud Question";

      return baseBlock({
        id: makeId("blk"),
        type: "feud-final",
        label: label,
        roundName: "Final Question",
        categoryName: data.block.categoryName,
        questionType: "feud-question",
        themeStyle: "Final Question",
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 1,
        notes: data.block.questionNotes,
        slides: buildFeudSlides(data, "feud-final", label, "feud-final-intro"),
        summary: { publishReady: false, reusable: true, templateEligible: true },
      });
    }

    function createClosingSlideBlock(formData) {
      const data = normalizeFormData(formData);
      return baseBlock({
        id: makeId("blk"),
        type: "closing-slide",
        label: "Closing Slide",
        roundName: "Closing",
        categoryName: data.block.categoryName,
        questionType: "display",
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
        questionCount: 0,
        notes: data.block.questionNotes,
        slides: [
          {
            id: makeId("sld"),
            kind: "closing",
            stateKey: "closing.thank-you",
            stateLabel: "Closing Thank You",
            audienceMode: "live",
            title: "Thanks for Playing",
            categoryName: data.block.categoryName || "See You Next Time",
            prompt: data.block.questionText || "Thanks for playing Beach Trivia tonight.",
            notes: data.block.questionNotes || "",
            layout: "closing",
            revealable: false,
          },
        ],
        summary: {
          publishReady: false,
          reusable: true,
          templateEligible: true,
        },
      });
    }
  
    function createQuestionSlide(config) {
      const data = normalizeFormData(config.formData);
      const questionNumber = Number(config.questionNumber || 1);
      const mode = String(config.mode || "live");
      const stateKey = config.stateKey || "round.q1.live";
      const stateLabel = config.stateLabel || "Question Live";
  
      return {
        id: makeId("sld"),
        kind: "question",
        stateKey: stateKey,
        stateLabel: stateLabel,
        audienceMode: mode,
        title: data.block.roundName || "Round",
        categoryName: data.block.categoryName || "Category",
        questionNumber: questionNumber,
        questionType: data.block.questionType,
        prompt: data.block.questionText || "",
        answer: data.block.answerText || "",
        options: normalizeOptions(data.block.options),
        notes: data.block.questionNotes || "",
        imageUrl: data.block.imageUrl || "",
        audioUrl: data.block.audioUrl || "",
        layout: mode === "reveal" ? "question-reveal" : "question-live",
        revealable: mode === "live",
        themeStyle: data.block.themeStyle,
        fontSizeMode: data.block.fontSizeMode,
        categorySlug: config.categorySlug || slugify(data.block.categoryName || "category"),
      };
    }
  
    function createNamedStateList(block) {
      if (!block || !Array.isArray(block.slides)) return [];
      return block.slides.map(function (slide, index) {
        return {
          index: index,
          stateKey: slide.stateKey,
          stateLabel: slide.stateLabel,
          kind: slide.kind,
          revealable: !!slide.revealable,
        };
      });
    }
  
    function duplicateBlock(block) {
      const source = safeClone(block || {});
      source.id = makeId("blk");
      source.label = (source.label || "Block") + " Copy";
      source.createdAt = nowIso();
      source.updatedAt = nowIso();
  
      if (Array.isArray(source.slides)) {
        source.slides = source.slides.map(function (slide) {
          const newSlide = safeClone(slide);
          newSlide.id = makeId("sld");
          return newSlide;
        });
      }
  
      return source;
    }
  
    function baseBlock(partial) {
      const block = {
        id: partial.id || makeId("blk"),
        type: partial.type || "single-question",
        label: partial.label || "Untitled Block",
        roundName: partial.roundName || "",
        categoryName: partial.categoryName || "",
        questionType: partial.questionType || "multiple-choice",
        themeStyle: partial.themeStyle || "Standard Trivia",
        fontSizeMode: partial.fontSizeMode || "Auto Fit",
        questionCount: Number(partial.questionCount || 0),
        notes: partial.notes || "",
        slides: Array.isArray(partial.slides) ? partial.slides : [],
        summary: partial.summary || {},
        stateList: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        createdBy: DEFAULT_AUTHOR,
        version: 1,
      };
  
      block.stateList = createNamedStateList(block);
      return block;
    }
  
    function buildSingleQuestionLabel(data) {
      const round = data.block.roundName || "Round";
      const category = data.block.categoryName || "Category";
      return round + " • " + category + " • Single Question";
    }
  
    function buildSummaryAnswers(data, count) {
      const answer = data.block.answerText || "";
      const items = [];
      for (let i = 1; i <= count; i += 1) {
        items.push({
          questionNumber: i,
          answer: answer,
        });
      }
      return items;
    }
  
    function normalizeFormData(formData) {
      const data = safeClone(formData || {});
      const show = data.show || {};
      const block = data.block || {};

      return {
        show: {
          title: stringOr(show.title, ""),
          dateLabel: stringOr(show.dateLabel, ""),
          status: stringOr(show.status, "draft"),
          showType: stringOr(show.showType, "classic-trivia"),
        },
        block: {
          type: stringOr(block.type, "single-question"),
          questionType: stringOr(block.questionType, "multiple-choice"),
          roundName: stringOr(block.roundName, "Round 1"),
          categoryName: stringOr(block.categoryName, ""),
          questionText: stringOr(block.questionText, ""),
          answerText: stringOr(block.answerText, ""),
          questionNotes: stringOr(block.questionNotes, ""),
          optionCount: Number(block.optionCount || 0),
          options: normalizeOptions(block.options),
          feudAnswers: normalizeFeudAnswers(block.feudAnswers),
          imageUrl: stringOr(block.imageUrl, ""),
          audioUrl: stringOr(block.audioUrl, ""),
          themeStyle: stringOr(block.themeStyle, "Standard Trivia"),
          fontSizeMode: stringOr(block.fontSizeMode, "Auto Fit"),
        },
      };
    }

    function normalizeFeudAnswers(answers) {
      if (!Array.isArray(answers)) return [];
      return answers.slice(0, 8).map(function (a, i) {
        return {
          text:   String((a && a.text) || "").trim(),
          points: 8 - i,
        };
      });
    }

    function normalizeOptions(options) {
      if (!Array.isArray(options)) return [];
      return options
        .map(function (item) {
          return String(item || "").trim();
        })
        .filter(function (item) {
          return item.length > 0;
        });
    }
  
    function slugify(value) {
      return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "item";
    }
  
    function makeId(prefix) {
      return [
        prefix || "id",
        Date.now().toString(36),
        Math.random().toString(36).slice(2, 8),
      ].join("_");
    }
  
    function nowIso() {
      return new Date().toISOString();
    }
  
    function safeClone(value) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (err) {
        console.warn("[writer:block-builder] clone failed:", err);
        return {};
      }
    }
  
    function stringOr(value, fallback) {
      return value == null ? fallback : String(value);
    }
  })();