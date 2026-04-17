(function () {
  "use strict";

  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const browseBtn = document.getElementById("browseBtn");
  const selectedFileNote = document.getElementById("selectedFileNote");
  const extractBtn = document.getElementById("extractBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const includeAnswers = document.getElementById("includeAnswers");
  const onlyQuestionSlides = document.getElementById("onlyQuestionSlides");
  const includeRawText = document.getElementById("includeRawText");
  const fileNameStat = document.getElementById("fileNameStat");
  const slidesStat = document.getElementById("slidesStat");
  const rowsStat = document.getElementById("rowsStat");
  const statusBox = document.getElementById("statusBox");
  const resultsBody = document.getElementById("resultsBody");

  let selectedFile = null;
  let extractedRows = [];
  let parsedSlides = [];
  let selectedFileTheme = "";

  fileInput.addEventListener("change", handleFileSelection);

  browseBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener("click", (event) => {
    if (event.target === browseBtn) return;
    fileInput.click();
  });

  extractBtn.addEventListener("click", handleExtract);
  downloadBtn.addEventListener("click", handleDownloadCsv);

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (eventName === "drop") {
        const file = event.dataTransfer?.files?.[0];
        if (file) setSelectedFile(file);
      }

      dropzone.classList.remove("dragover");
    });
  });

  function handleFileSelection(event) {
    const file = event.target.files?.[0];
    if (file) setSelectedFile(file);
  }

  function setSelectedFile(file) {
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      selectedFileNote.textContent = "No file selected";
      setStatus("Please choose a .pptx file.", true);
      return;
    }

    selectedFile = file;
    selectedFileTheme = inferShowThemeFromFileName(file.name);
    selectedFileNote.textContent = `Selected: ${file.name}`;
    extractedRows = [];
    parsedSlides = [];

    fileNameStat.textContent = truncateMiddle(file.name, 20);
    slidesStat.textContent = "0";
    rowsStat.textContent = "0";
    renderRows([]);

    setStatus('File loaded. Click “Extract Questions” to parse slides.');
    extractBtn.disabled = false;
    downloadBtn.disabled = true;
  }

  async function handleExtract() {
    if (!selectedFile) {
      setStatus("Choose a .pptx file first.", true);
      return;
    }

    try {
      extractBtn.disabled = true;
      downloadBtn.disabled = true;
      setStatus("Reading PPTX package and parsing slide text...");

      const zip = await JSZip.loadAsync(selectedFile);
      const slidePaths = Object.keys(zip.files)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
        .sort((a, b) => getSlideNumberFromPath(a) - getSlideNumberFromPath(b));

      const slides = [];
      for (const slidePath of slidePaths) {
        const xml = await zip.file(slidePath).async("text");
        const texts = extractTextRuns(xml);

        slides.push({
          slideNumber: getSlideNumberFromPath(slidePath),
          slidePath,
          texts,
          rawText: normalizeWhitespace(texts.join(" | ")),
        });
      }

      parsedSlides = classifySlides(slides);
      extractedRows = buildRows(parsedSlides, {
        includeAnswers: includeAnswers.checked,
        onlyQuestionSlides: onlyQuestionSlides.checked,
        includeRawText: includeRawText.checked,
        sourceFileName: selectedFile.name,
      });

      slidesStat.textContent = String(parsedSlides.length);
      rowsStat.textContent = String(extractedRows.length);
      renderRows(extractedRows);

      if (extractedRows.length) {
        setStatus(`Done. Parsed ${parsedSlides.length} slides and prepared ${extractedRows.length} CSV rows.`);
        downloadBtn.disabled = false;
      } else {
        setStatus(
          'Parsing finished, but no rows matched the current rules. Try unchecking “Only export slides that look like question slides.”',
          true
        );
      }
    } catch (error) {
      console.error(error);
      setStatus(`Extraction failed: ${error.message}`, true);
    } finally {
      extractBtn.disabled = false;
    }
  }

  function extractTextRuns(xmlString) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "application/xml");
    const textNodes = Array.from(xml.getElementsByTagNameNS("*", "t"));

    return textNodes
      .map((node) => node.textContent || "")
      .map((text) => normalizeWhitespace(text))
      .filter(Boolean);
  }

  function classifySlides(slides) {
    let currentRound = "";
    let currentCategories = [];
    let currentRoundTheme = "";
    let currentRoundType = "";

    return slides.map((slide, index) => {
      const lines = slide.texts.map(normalizeWhitespace).filter(Boolean);
      const rawTextLower = slide.rawText.toLowerCase();
      const firstLine = lines[0] || "";

      let type = "other";
      let roundLabel = currentRound;
      let roundType = currentRoundType || "";
      let roundTheme = currentRoundTheme || "";
      let category = "";
      let questionNumber = "";
      let questionText = "";
      let answerText = "";

      const roundCategoriesMatch = firstLine.match(/^round\s+(\d+)\s+categories\s*:?/i);
      const categoryOfDayMatch = firstLine.match(/^round\s+(\d+)\s*[-–:]?\s*category of the day/i);
      const roundAnswersMatch = firstLine.match(/^round\s+(\d+)\s+answers\s*:?/i);
      const genericRoundHeaderMatch = firstLine.match(/^round\s+(\d+)\b/i);
      const questionMatch = firstLine.match(/^question\s+(\d+)\s*[-–:]?/i);
      const halftimeMatch = /half\s*time/i.test(firstLine);
      const finalMatch = /^final/i.test(firstLine);

      if (roundCategoriesMatch) {
        type = "round_categories";
        roundLabel = `Round ${roundCategoriesMatch[1]}`;
        roundType = "standard";
        roundTheme = "";
        currentRound = roundLabel;
        currentRoundType = roundType;
        currentRoundTheme = roundTheme;
        currentCategories = lines.slice(1).filter(Boolean);

      } else if (categoryOfDayMatch) {
        type = "category_of_day_round";
        roundLabel = `Round ${categoryOfDayMatch[1]}`;
        roundType = "category_of_day";
        roundTheme = lines[1] || selectedFileTheme || "";
        currentRound = roundLabel;
        currentRoundType = roundType;
        currentRoundTheme = roundTheme;
        currentCategories = roundTheme ? [roundTheme, roundTheme, roundTheme, roundTheme, roundTheme] : [];

      } else if (
        genericRoundHeaderMatch &&
        lines.length <= 3 &&
        !questionMatch &&
        !roundAnswersMatch &&
        !roundCategoriesMatch &&
        !categoryOfDayMatch
      ) {
        type = "round_header";
        roundLabel = `Round ${genericRoundHeaderMatch[1]}`;
        roundTheme = lines[1] || "";
        roundType = roundTheme ? "themed_round" : "standard";
        currentRound = roundLabel;
        currentRoundType = roundType;
        currentRoundTheme = roundTheme;
        currentCategories = roundTheme ? [roundTheme, roundTheme, roundTheme, roundTheme, roundTheme] : [];

      } else if (roundAnswersMatch) {
        type = "round_answers";
        roundLabel = `Round ${roundAnswersMatch[1]}`;
        roundType = currentRoundType || (currentRoundTheme ? "themed" : "standard");
        roundTheme = currentRoundTheme || "";
        currentRound = roundLabel;
        currentRoundType = roundType;
        answerText = lines.slice(1).join(" | ");

      } else if (questionMatch) {
        type = "question";
        questionNumber = questionMatch[1];
        roundLabel = currentRound;
        roundType = currentRoundType || (currentRoundTheme ? "themed" : "standard");

        const explicitCategory = extractQuestionCategory(lines);
        category =
          explicitCategory ||
          inferCategoryFromRound(questionNumber, currentCategories) ||
          selectedFileTheme ||
          "";

        roundTheme = currentRoundTheme || selectedFileTheme || "";
        questionText = extractQuestionText(lines);

      } else if (halftimeMatch) {
        type = "halftime";
        roundType = "halftime";
        roundTheme = selectedFileTheme || "";
        questionText = lines.join(" ");

      } else if (finalMatch) {
        type = rawTextLower.includes("answer") ? "final_answer" : "final";
        roundType = "final";
        roundTheme = selectedFileTheme || "";
        questionText = lines.join(" ");

      } else if (looksLikeEndOfRound(rawTextLower)) {
        type = "round_break";

      } else if (looksLikeStandaloneAnswer(lines, index, slides)) {
        type = "answer";
        answerText = lines.join(" | ");
      }

      return {
        ...slide,
        index,
        type,
        roundLabel,
        roundType,
        roundTheme,
        category,
        questionNumber,
        questionText,
        answerText,
      };
    });
  }

  function extractQuestionCategory(lines) {
    if (!lines.length) return "";
    if (lines.length >= 2) {
      const secondLine = lines[1] || "";
      if (looksLikeCategoryLine(secondLine)) {
        return secondLine;
      }
    }
    return "";
  }

  function extractQuestionText(lines) {
    if (!lines.length) return "";
    if (lines.length >= 3 && looksLikeCategoryLine(lines[1])) {
      return lines.slice(2).join(" ").trim();
    }
    return lines.slice(1).join(" ").trim();
  }

  function looksLikeCategoryLine(value) {
    const text = normalizeWhitespace(value);
    if (!text) return false;
    if (/^question\s+\d+/i.test(text)) return false;
    if (/^round\s+\d+/i.test(text)) return false;
    if (/^half\s*time/i.test(text)) return false;
    if (/^final/i.test(text)) return false;
    if (/answer/i.test(text) && text.length > 40) return false;
    return text.length <= 80;
  }

  function buildRows(parsedSlides, options) {
    const rows = [];

    for (let i = 0; i < parsedSlides.length; i += 1) {
      const slide = parsedSlides[i];
      if (options.onlyQuestionSlides && slide.type !== "question") continue;

      let pairedAnswer = "";
      if (options.includeAnswers && slide.type === "question") {
        pairedAnswer = findPairedAnswer(parsedSlides, i);
      }

      rows.push({
        source_file: options.sourceFileName,
        question_row: rows.length + 1,
        show_theme: selectedFileTheme || "",
        slide_number: slide.slideNumber,
        slide_type: slide.type,
        round: slide.roundLabel || "",
        round_type: slide.roundType || "",
        round_theme: slide.roundTheme || "",
        question_number: slide.questionNumber || "",
        category: slide.category || "",
        theme_source: getThemeSource(slide, selectedFileTheme),
        question_text: slide.questionText || "",
        answer_text: pairedAnswer || slide.answerText || "",
        raw_text: options.includeRawText ? slide.rawText : "",
      });
    }

    return rows;
  }

  function findPairedAnswer(parsedSlides, questionIndex) {
    const questionSlide = parsedSlides[questionIndex];
    const nextSlide = parsedSlides[questionIndex + 1];
    const roundAnswerSlide = parsedSlides.find((slide, idx) => {
      return (
        idx > questionIndex &&
        slide.type === "round_answers" &&
        slide.roundLabel === questionSlide.roundLabel
      );
    });

    if (nextSlide && nextSlide.type === "answer") {
      return nextSlide.answerText;
    }

    if (roundAnswerSlide && questionSlide.questionNumber) {
      const answerLines = parseRoundAnswers(roundAnswerSlide.texts.slice(1));
      const answerIdx = Number(questionSlide.questionNumber) - 1;
      return answerLines[answerIdx] || "";
    }

    return "";
  }

  function parseRoundAnswers(lines) {
    const cleaned = lines.map(normalizeWhitespace).filter(Boolean);
    if (!cleaned.length) return [];

    const indexed = [];
    let current = "";

    for (const line of cleaned) {
      const numbered = line.match(/^(\d+)\s*[\).:-]\s*(.*)$/);

      if (numbered) {
        if (current) indexed.push(current.trim());
        current = numbered[2] || "";
        continue;
      }

      if (current) {
        current += (current ? " " : "") + line;
      } else {
        indexed.push(line);
      }
    }

    if (current) indexed.push(current.trim());

    if (indexed.length >= 5) return indexed;
    return cleaned;
  }

  function looksLikeStandaloneAnswer(lines, index, slides) {
    if (!lines.length) return false;

    const joined = lines.join(" | ").toLowerCase();
    const previous = slides[index - 1];
    const hasShortContent = joined.length < 220;
    const doesNotLookLikePrompt =
      !/^question\s+\d+/i.test(lines[0] || "") &&
      !/categories/i.test(joined);
    const previousLooksQuestion =
      previous && /^question\s+\d+/i.test(previous.texts?.[0] || "");

    return previousLooksQuestion && hasShortContent && doesNotLookLikePrompt;
  }

  function looksLikeEndOfRound(rawTextLower) {
    return (
      rawTextLower.includes("end of round") ||
      rawTextLower.includes("bring up your answer sheet")
    );
  }

  function getThemeSource(slide, fallbackTheme) {
    if (slide.type === "question") {
      const explicitCategory = extractQuestionCategory(
        slide.texts.map(normalizeWhitespace).filter(Boolean)
      );
      if (explicitCategory) return "slide";
      if (slide.roundTheme) return "round_header";
      if (fallbackTheme) return "filename";
    }
    if (slide.roundTheme) return "round_header";
    if (fallbackTheme) return "filename";
    return "";
  }

  function inferCategoryFromRound(questionNumber, categories) {
    const idx = Number(questionNumber) - 1;
    return categories[idx] || "";
  }

  function getSlideNumberFromPath(path) {
    const match = path.match(/slide(\d+)\.xml$/i);
    return match ? Number(match[1]) : 0;
  }

  function normalizeWhitespace(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function setStatus(message, isError = false) {
    statusBox.textContent = message;
    statusBox.style.background = isError
      ? "rgba(220, 38, 38, 0.1)"
      : "rgba(19,32,51,0.05)";
    statusBox.style.color = isError ? "#991b1b" : "var(--text)";
  }

  function renderRows(rows) {
    if (!rows.length) {
      resultsBody.innerHTML = '<tr><td colspan="12" class="muted">No extraction yet.</td></tr>';
      return;
    }

    resultsBody.innerHTML = rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.question_row)}</td>
            <td>${escapeHtml(row.slide_number)}</td>
            <td><span class="pill">${escapeHtml(row.slide_type)}</span></td>
            <td>${escapeHtml(row.round)}</td>
            <td>${escapeHtml(row.round_type)}</td>
            <td>${escapeHtml(row.round_theme)}</td>
            <td>${escapeHtml(row.question_number)}</td>
            <td>${escapeHtml(row.category)}</td>
            <td>${escapeHtml(row.theme_source)}</td>
            <td>${escapeHtml(row.question_text)}</td>
            <td>${escapeHtml(row.answer_text)}</td>
            <td>${escapeHtml(row.raw_text)}</td>
          </tr>
        `
      )
      .join("");
  }

  function handleDownloadCsv() {
    if (!extractedRows.length) {
      setStatus("Nothing to download yet.", true);
      return;
    }

    const csv = buildCsv(extractedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (selectedFile?.name || "questions").replace(/\.pptx$/i, "");

    a.href = url;
    a.download = `${safeName}-questions.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function buildCsv(rows) {
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(",")];

    for (const row of rows) {
      lines.push(headers.map((key) => csvEscape(row[key])).join(","));
    }

    return lines.join("\n");
  }

  function csvEscape(value) {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function inferShowThemeFromFileName(fileName) {
    const match = String(fileName || "").match(/\(([^)]+)\)/);
    return match ? normalizeWhitespace(match[1]) : "";
  }

  function truncateMiddle(value, maxLength) {
    const str = String(value || "");
    if (str.length <= maxLength) return str;

    const front = Math.ceil((maxLength - 3) / 2);
    const back = Math.floor((maxLength - 3) / 2);
    return `${str.slice(0, front)}...${str.slice(str.length - back)}`;
  }
})();
