/**
 * RipperDoc — Adobe Photoshop UXP Plugin
 * Asset Extractor // Web to Canvas
 * Created by Nephuxs
 */

(function () {
  "use strict";

  // -------------------------------------------------------------
  // Photoshop & UXP Modules
  // -------------------------------------------------------------
  let psApp, psCore, psAction, uxpFs, uxpFormats;
  try {
    const photoshop = require("photoshop");
    psApp = photoshop.app;
    psCore = photoshop.core;
    psAction = photoshop.action;

    const uxp = require("uxp");
    uxpFs = uxp.storage.localFileSystem;
    uxpFormats = uxp.storage.formats;
  } catch (err) {
    console.warn("RipperDoc running in standard browser/preview mode:", err);
  }

  // -------------------------------------------------------------
  // File Format Extensions & Supported Types
  // -------------------------------------------------------------
  const IMAGE_EXTS = ["webp", "avif", "png", "jpg", "jpeg", "svg", "gif", "ico"];
  const VIDEO_EXTS = ["mp4", "webm", "m3u8", "ts", "mpd", "mov", "m4v", "avi", "mkv", "ogv", "flv", "wmv", "3gp"];
  const AUDIO_EXTS = ["mp3", "m4a", "aac", "ogg", "opus", "wav", "weba", "flac", "wma", "aiff"];
  const FONT_EXTS = ["woff2", "woff", "ttf", "otf", "eot"];

  const FILTER_LABELS = {
    all: "ALL ASSETS",
    images: "ALL IMAGES",
    png: "PNG (.png)",
    jpg: "JPG / JPEG",
    webp: "WEBP (.webp)",
    avif: "AVIF (.avif)",
    svg: "SVG VECTOR",
    gif: "GIF ANIMATION",
    ico: "ICO ICONS",
    video: "VIDEOS",
    audio: "AUDIO TRACKS",
    font: "FONTS"
  };

  // -------------------------------------------------------------
  // State
  // -------------------------------------------------------------
  let allAssets = [];
  let currentFilter = "all";
  let currentThumbSize = 115;

  // -------------------------------------------------------------
  // DOM Elements
  // -------------------------------------------------------------
  const urlInput = document.getElementById("urlInput");
  const ripBtn = document.getElementById("ripBtn");
  const ripBtnText = document.getElementById("ripBtnText");
  const statusBanner = document.getElementById("statusBanner");
  const statusMessage = document.getElementById("statusMessage");
  const emptyState = document.getElementById("emptyState");
  const resultsContainer = document.getElementById("resultsContainer");
  const assetGrid = document.getElementById("assetGrid");
  const appFooter = document.getElementById("appFooter");
  const visibleStats = document.getElementById("visibleStats");
  const sizeSlider = document.getElementById("sizeSlider");
  const sizeValue = document.getElementById("sizeValue");
  const toast = document.getElementById("toast");
  const rebootBtn = document.getElementById("rebootBtn");

  // Single Dropdown Controls
  const filterDropdownWrapper = document.getElementById("filterDropdownWrapper");
  const filterDropdownBtn = document.getElementById("filterDropdownBtn");
  const filterDropdownMenu = document.getElementById("filterDropdownMenu");
  const activeFilterName = document.getElementById("activeFilterName");
  const activeFilterBadge = document.getElementById("activeFilterBadge");

  // Count Badges in Dropdown Menu
  const countAll = document.getElementById("count-all");
  const countImages = document.getElementById("count-images");
  const countPng = document.getElementById("count-png");
  const countJpg = document.getElementById("count-jpg");
  const countWebp = document.getElementById("count-webp");
  const countAvif = document.getElementById("count-avif");
  const countSvg = document.getElementById("count-svg");
  const countGif = document.getElementById("count-gif");
  const countIco = document.getElementById("count-ico");
  const countVideo = document.getElementById("count-video");
  const countAudio = document.getElementById("count-audio");
  const countFont = document.getElementById("count-font");

  // -------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------
  function init() {
    setupEventListeners();
  }

  function setupEventListeners() {
    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ripAssets();
    });

    ripBtn.addEventListener("click", ripAssets);

    // Toggle Dropdown Menu
    filterDropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = filterDropdownMenu.style.display === "flex";
      if (isOpen) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    // Dropdown Item Selection
    filterDropdownMenu.addEventListener("click", (e) => {
      const item = e.target.closest(".dropdown-item");
      if (!item) return;
      const filterKey = item.getAttribute("data-filter") || "all";
      selectFilter(filterKey);
    });

    // Close Dropdown on Click Outside
    document.addEventListener("click", (e) => {
      if (filterDropdownWrapper && !filterDropdownWrapper.contains(e.target)) {
        closeDropdown();
      }
    });

    // Accelerated scroll on results container for smooth, fast scrolling
    if (resultsContainer) {
      resultsContainer.addEventListener("wheel", (e) => {
        resultsContainer.scrollTop += e.deltaY * 2.2;
      }, { passive: true });
    }

    // Thumbnail size slider
    sizeSlider.addEventListener("input", (e) => {
      currentThumbSize = parseInt(e.target.value, 10) || 115;
      sizeValue.textContent = `${currentThumbSize}px`;
      document.documentElement.style.setProperty("--thumb-size", `${currentThumbSize}px`);
      document.querySelectorAll(".asset-card").forEach((c) => {
        c.style.width = `${currentThumbSize}px`;
      });
      document.querySelectorAll(".card-preview").forEach((p) => {
        p.style.height = `${currentThumbSize}px`;
      });
    });

    // Reboot button handler
    if (rebootBtn) {
      rebootBtn.addEventListener("click", rebootPlugin);
    }
  }

  function openDropdown() {
    filterDropdownMenu.style.display = "flex";
    filterDropdownBtn.classList.add("open");
    filterDropdownBtn.setAttribute("aria-expanded", "true");
  }

  function closeDropdown() {
    filterDropdownMenu.style.display = "none";
    filterDropdownBtn.classList.remove("open");
    filterDropdownBtn.setAttribute("aria-expanded", "false");
  }

  function selectFilter(filterKey) {
    currentFilter = filterKey;

    // Update active highlight on dropdown items
    document.querySelectorAll(".dropdown-item").forEach((el) => {
      if (el.getAttribute("data-filter") === filterKey) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });

    // Update button text and badge
    activeFilterName.textContent = FILTER_LABELS[filterKey] || filterKey.toUpperCase();
    updateDropdownButtonBadge();

    closeDropdown();
    renderAssets();
  }

  function rebootPlugin() {
    urlInput.value = "";
    allAssets = [];
    currentFilter = "all";

    // Reset dropdown
    document.querySelectorAll(".dropdown-item").forEach((el) => {
      el.classList.remove("active");
    });
    const allItem = document.querySelector('.dropdown-item[data-filter="all"]');
    if (allItem) allItem.classList.add("active");

    activeFilterName.textContent = FILTER_LABELS.all;
    closeDropdown();

    // Reset count badges
    updateFilterCounts();

    // Clear results grid and show empty state
    assetGrid.innerHTML = "";
    emptyState.style.display = "flex";
    visibleStats.textContent = "READY";

    // Focus URL input for immediate pasting
    urlInput.focus();

    showToast("RipperDoc rebooted — ready for new URL!");
  }

  // -------------------------------------------------------------
  // Scraping Engine
  // -------------------------------------------------------------
  async function ripAssets() {
    let rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      showToast("Please enter a website URL", true);
      urlInput.focus();
      return;
    }

    if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
      rawUrl = "https://" + rawUrl;
      urlInput.value = rawUrl;
    }

    let baseUrl;
    try {
      baseUrl = new URL(rawUrl);
    } catch (e) {
      showToast("Invalid URL format", true);
      return;
    }

    setLoading(true, `HARVESTING ASSETS FROM ${baseUrl.hostname.toUpperCase()}...`);
    allAssets = [];

    try {
      const response = await fetch(rawUrl, {
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const html = await response.text();

      // Extract top linked stylesheets to uncover @font-face and background images
      const cssUrls = [];
      const linkTagRegex = /<link\b([^>]*)>/gi;
      let linkM;
      while ((linkM = linkTagRegex.exec(html)) !== null) {
        const tag = linkM[1];
        const rel = extractAttr(tag, "rel");
        if (rel && /stylesheet/i.test(rel)) {
          const href = extractAttr(tag, "href");
          if (href) {
            try {
              cssUrls.push(new URL(href, baseUrl.href).href);
            } catch (e) {}
          }
        }
      }

      // Concurrently fetch up to 4 external stylesheets (with timeout) to extract web fonts
      let extraCssText = "";
      if (cssUrls.length > 0) {
        try {
          const fetchPromises = cssUrls.slice(0, 4).map(async (cssUrl) => {
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 3500);
              const cssResp = await fetch(cssUrl, { signal: controller.signal });
              clearTimeout(timer);
              if (cssResp.ok) return await cssResp.text();
            } catch (e) {}
            return "";
          });

          const results = await Promise.allSettled(fetchPromises);
          results.forEach((r) => {
            if (r.status === "fulfilled" && r.value) {
              extraCssText += "\n" + r.value;
            }
          });
        } catch (cssErr) {
          console.warn("Could not fetch secondary stylesheets:", cssErr);
        }
      }

      const combinedText = html + "\n" + extraCssText;
      const extracted = parseHtmlAssets(combinedText, baseUrl);

      allAssets = extracted;
      updateFilterCounts();
      renderAssets();

      if (allAssets.length === 0) {
        showToast("No media assets found on page", true);
      } else {
        showToast(`Harvested ${allAssets.length} assets successfully!`);
      }
    } catch (err) {
      console.error("Error scraping website:", err);
      showToast(`Scrape failed: ${err.message || err}`, true);
    } finally {
      setLoading(false);
    }
  }

  function extractAttr(tagStr, attrName) {
    const regex = new RegExp(`(?:\\s|^)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
    const m = tagStr.match(regex);
    if (!m) return null;
    return m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
  }

  function parseSrcset(srcset) {
    return srcset
      .split(",")
      .map((item) => item.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  function extractFilename(url) {
    if (url.startsWith("data:")) return null;
    try {
      const pathname = new URL(url).pathname;
      const part = pathname.substring(pathname.lastIndexOf("/") + 1);
      return decodeURIComponent(part.split("?")[0]) || null;
    } catch (e) {
      return null;
    }
  }

  function extractFontDisplayName(url, filename) {
    let name = filename || "";
    try {
      if (!name && url) {
        name = new URL(url).pathname.split("/").pop();
      }
    } catch (e) {}
    name = name.replace(/\.(woff2?|ttf|otf|eot)(\?.*)?$/i, "");
    name = name.replace(/[_-]+/g, " ").trim();
    return name || "Font Family";
  }

  function getExtension(url, fallbackType) {
    if (url.startsWith("data:image/svg+xml")) return "svg";
    if (url.startsWith("data:image/png")) return "png";
    if (url.startsWith("data:image/jpeg")) return "jpg";
    if (url.startsWith("data:image/gif")) return "gif";
    if (url.startsWith("data:image/webp")) return "webp";
    if (url.startsWith("data:image/avif")) return "avif";
    if (url.startsWith("data:image/x-icon") || url.startsWith("data:image/vnd.microsoft.icon")) return "ico";
    if (url.startsWith("data:font/woff2") || url.startsWith("data:application/font-woff2")) return "woff2";
    if (url.startsWith("data:font/woff") || url.startsWith("data:application/font-woff")) return "woff";
    if (url.startsWith("data:font/ttf") || url.startsWith("data:application/x-font-ttf")) return "ttf";
    if (url.startsWith("data:font/otf") || url.startsWith("data:application/x-font-otf")) return "otf";

    if (url.includes("images.unsplash.com")) return "jpg";

    try {
      const u = new URL(url);
      const m = u.pathname.match(/\.([a-z0-9]{2,5})$/i);
      if (m) return m[1].toLowerCase();
    } catch (e) {
      const m = url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
      if (m) return m[1].toLowerCase();
    }

    if (fallbackType === "svg") return "svg";
    if (fallbackType === "video") return "mp4";
    if (fallbackType === "audio") return "mp3";
    if (fallbackType === "font") return "woff2";
    return "png";
  }

  function categorizeAsset(url, ext, initialType) {
    const e = (ext || "").toLowerCase();
    if (FONT_EXTS.includes(e) || initialType === "font") return "font";
    if (VIDEO_EXTS.includes(e) || initialType === "video") return "video";
    if (AUDIO_EXTS.includes(e) || initialType === "audio") return "audio";
    if (e === "svg" || initialType === "svg") return "svg";
    if (e === "png") return "png";
    if (e === "jpg" || e === "jpeg") return "jpg";
    if (e === "webp") return "webp";
    if (e === "avif") return "avif";
    if (e === "gif") return "gif";
    if (e === "ico") return "ico";
    return "image";
  }

  function parseHtmlAssets(html, baseUrl) {
    const assetMap = new Map();

    function addAsset(rawUrl, type, meta = {}) {
      if (!rawUrl) return;
      rawUrl = rawUrl.trim().replace(/\\/g, "");

      let resolvedUrl;
      if (rawUrl.startsWith("data:")) {
        resolvedUrl = rawUrl;
      } else {
        try {
          resolvedUrl = new URL(rawUrl, baseUrl.href).href;
        } catch (e) {
          return;
        }
      }

      if (assetMap.has(resolvedUrl)) return;

      const ext = getExtension(resolvedUrl, type);
      const category = categorizeAsset(resolvedUrl, ext, type);
      const filename = meta.filename || extractFilename(resolvedUrl) || `asset_${assetMap.size + 1}.${ext}`;

      assetMap.set(resolvedUrl, {
        id: `asset_${assetMap.size + 1}`,
        url: resolvedUrl,
        type: category,
        extension: ext.toUpperCase(),
        filename: filename,
        isInlineSvg: !!meta.isInlineSvg,
        rawSvg: meta.rawSvg || null,
        dimensions: meta.dimensions || null
      });
    }

    // 1. <img> tags (src, srcset, data-src, etc.)
    const imgRegex = /<img\b([^>]*)>/gi;
    let m;
    while ((m = imgRegex.exec(html)) !== null) {
      const tag = m[1];
      const src = extractAttr(tag, "src") || 
                  extractAttr(tag, "data-src") || 
                  extractAttr(tag, "data-original") || 
                  extractAttr(tag, "data-lazy-src") ||
                  extractAttr(tag, "data-highres");
      const width = extractAttr(tag, "width");
      const height = extractAttr(tag, "height");
      const dims = (width && height) ? `${width} × ${height}` : null;
      if (src) addAsset(src, "image", { dimensions: dims });

      const srcset = extractAttr(tag, "srcset") || extractAttr(tag, "data-srcset");
      if (srcset) {
        parseSrcset(srcset).forEach((u) => addAsset(u, "image"));
      }
    }

    // 2. OpenGraph & Twitter <meta> tags
    const metaRegex = /<meta\b([^>]*)>/gi;
    while ((m = metaRegex.exec(html)) !== null) {
      const tag = m[1];
      const prop = extractAttr(tag, "property") || extractAttr(tag, "name");
      if (prop && /image|video|audio/i.test(prop)) {
        const content = extractAttr(tag, "content");
        if (content) {
          if (/video/i.test(prop)) addAsset(content, "video");
          else if (/audio/i.test(prop)) addAsset(content, "audio");
          else addAsset(content, "image");
        }
      }
    }

    // 3. <picture> and <source> tags
    const sourceRegex = /<source\b([^>]*)>/gi;
    while ((m = sourceRegex.exec(html)) !== null) {
      const tag = m[1];
      const src = extractAttr(tag, "src");
      const type = extractAttr(tag, "type") || "";
      let assumedType = "image";
      if (type.includes("video")) assumedType = "video";
      else if (type.includes("audio")) assumedType = "audio";

      if (src) addAsset(src, assumedType);
      const srcset = extractAttr(tag, "srcset");
      if (srcset) {
        parseSrcset(srcset).forEach((u) => addAsset(u, assumedType));
      }
    }

    // 4. Inline <svg> tags
    const svgRegex = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi;
    let svgIdx = 0;
    while ((m = svgRegex.exec(html)) !== null) {
      try {
        svgIdx++;
        let fullSvg = m[0];
        if (!fullSvg.includes("xmlns=")) {
          fullSvg = fullSvg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        const encoded = encodeURIComponent(fullSvg);
        const dataUri = `data:image/svg+xml;charset=utf-8,${encoded}`;

        const width = extractAttr(m[1], "width") || 24;
        const height = extractAttr(m[1], "height") || 24;

        addAsset(dataUri, "svg", {
          isInlineSvg: true,
          rawSvg: fullSvg,
          filename: `vector_${svgIdx}.svg`,
          dimensions: `${width} × ${height}`
        });
      } catch (e) {}
    }

    // 5. <link> tags (Icons, Favicons, Preloaded Fonts/Media)
    const linkRegex = /<link\b([^>]*)>/gi;
    while ((m = linkRegex.exec(html)) !== null) {
      const tag = m[1];
      const rel = extractAttr(tag, "rel");
      const href = extractAttr(tag, "href");
      if (!href) continue;

      if (rel && /icon/i.test(rel)) {
        addAsset(href, "ico");
      } else if (rel && /preload/i.test(rel)) {
        const as = extractAttr(tag, "as") || "";
        if (as === "font") addAsset(href, "font");
        else if (as === "image") addAsset(href, "image");
        else if (as === "video") addAsset(href, "video");
        else if (as === "audio") addAsset(href, "audio");
      }
    }

    // 6. <video> and <audio> tags
    const videoRegex = /<video\b([^>]*)>/gi;
    while ((m = videoRegex.exec(html)) !== null) {
      const src = extractAttr(m[1], "src");
      if (src) addAsset(src, "video");
      const poster = extractAttr(m[1], "poster");
      if (poster) addAsset(poster, "image");
    }

    const audioRegex = /<audio\b([^>]*)>/gi;
    while ((m = audioRegex.exec(html)) !== null) {
      const src = extractAttr(m[1], "src");
      if (src) addAsset(src, "audio");
    }

    // 7. CSS url(...) declarations (Uncovers web fonts & background graphics)
    const urlDeclarationRegex = /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
    let urlM;
    while ((urlM = urlDeclarationRegex.exec(html)) !== null) {
      const candidate = urlM[1].trim();
      if (candidate.startsWith("data:")) {
        if (candidate.includes("image/svg") || candidate.includes("image/png") || candidate.includes("image/jpeg") || candidate.includes("font/")) {
          addAsset(candidate, "data");
        }
      } else if (!candidate.startsWith("#")) {
        addAsset(candidate, "url");
      }
    }

    // 8. Direct Media Regex Scans (Catches all modern formats in JSON, scripts, or HTML)
    // Images: webp, avif, png, jpg, jpeg, svg, gif, ico
    const imgDirectRegex = /https?:\/\/[^"'<>\s\\]+\.(?:webp|avif|png|jpe?g|svg|gif|ico)(?:\?[^"'<>\s\\]*)?/gi;
    while ((m = imgDirectRegex.exec(html)) !== null) {
      addAsset(m[0], "image");
    }

    // Video: mp4, webm, m3u8, ts, mpd, mov
    const vidDirectRegex = /https?:\/\/[^"'<>\s\\]+\.(?:mp4|webm|m3u8|ts|mpd|mov|m4v)(?:\?[^"'<>\s\\]*)?/gi;
    while ((m = vidDirectRegex.exec(html)) !== null) {
      addAsset(m[0], "video");
    }

    // Audio: mp3, m4a, aac, ogg, opus, wav, weba
    const audDirectRegex = /https?:\/\/[^"'<>\s\\]+\.(?:mp3|m4a|aac|ogg|opus|wav|weba|flac)(?:\?[^"'<>\s\\]*)?/gi;
    while ((m = audDirectRegex.exec(html)) !== null) {
      addAsset(m[0], "audio");
    }

    // Fonts: woff2, woff, ttf, otf, eot
    const fontDirectRegex = /https?:\/\/[^"'<>\s\\]+\.(?:woff2?|ttf|otf|eot)(?:\?[^"'<>\s\\]*)?/gi;
    while ((m = fontDirectRegex.exec(html)) !== null) {
      addAsset(m[0], "font");
    }

    // 9. Unsplash and CDN photo URLs
    const unsplashRegex = /https?:\/\/images\.unsplash\.com\/photo-[a-zA-Z0-9\-_]+(?:\?[^"'<>\s\\]*)?/gi;
    while ((m = unsplashRegex.exec(html)) !== null) {
      addAsset(m[0], "image");
    }

    // 10. Automatic Favicon candidate
    try {
      const favUrl = new URL("/favicon.ico", baseUrl.origin).href;
      addAsset(favUrl, "ico", { filename: "favicon.ico" });
    } catch (e) {}

    return Array.from(assetMap.values());
  }

  // -------------------------------------------------------------
  // Filter & Render
  // -------------------------------------------------------------
  function getAssetFilterCategory(asset) {
    const ext = (asset.extension || "").toLowerCase();
    const type = (asset.type || "").toLowerCase();

    if (type === "font" || FONT_EXTS.includes(ext)) return "font";
    if (type === "video" || VIDEO_EXTS.includes(ext)) return "video";
    if (type === "audio" || AUDIO_EXTS.includes(ext)) return "audio";
    if (type === "svg" || ext === "svg" || asset.isInlineSvg) return "svg";
    if (ext === "png") return "png";
    if (ext === "jpg" || ext === "jpeg") return "jpg";
    if (ext === "webp") return "webp";
    if (ext === "avif") return "avif";
    if (ext === "gif") return "gif";
    if (ext === "ico") return "ico";
    return "image";
  }

  function assetMatchesFilter(asset, filter) {
    if (filter === "all") return true;
    const ext = (asset.extension || "").toLowerCase();
    const cat = getAssetFilterCategory(asset);

    if (filter === "images") {
      return ["png", "jpg", "webp", "avif", "svg", "gif", "ico", "image"].includes(cat);
    }
    if (filter === "png") return ext === "png";
    if (filter === "jpg") return ext === "jpg" || ext === "jpeg";
    if (filter === "webp") return ext === "webp";
    if (filter === "avif") return ext === "avif";
    if (filter === "svg") return ext === "svg" || asset.isInlineSvg || cat === "svg";
    if (filter === "gif") return ext === "gif";
    if (filter === "ico") return ext === "ico";
    if (filter === "video") return cat === "video";
    if (filter === "audio") return cat === "audio";
    if (filter === "font") return cat === "font";
    return false;
  }

  function calculateCounts() {
    const validAssets = allAssets.filter((a) => !a.failed);
    const counts = {
      all: validAssets.length,
      images: 0,
      png: 0,
      jpg: 0,
      webp: 0,
      avif: 0,
      svg: 0,
      gif: 0,
      ico: 0,
      video: 0,
      audio: 0,
      font: 0
    };

    validAssets.forEach((a) => {
      const ext = (a.extension || "").toLowerCase();
      const cat = getAssetFilterCategory(a);

      if (["png", "jpg", "webp", "avif", "svg", "gif", "ico", "image"].includes(cat)) {
        counts.images++;
      }
      if (ext === "png") counts.png++;
      else if (ext === "jpg" || ext === "jpeg") counts.jpg++;
      else if (ext === "webp") counts.webp++;
      else if (ext === "avif") counts.avif++;
      else if (ext === "svg" || a.isInlineSvg) counts.svg++;
      else if (ext === "gif") counts.gif++;
      else if (ext === "ico") counts.ico++;

      if (cat === "video") counts.video++;
      else if (cat === "audio") counts.audio++;
      else if (cat === "font") counts.font++;
    });

    return counts;
  }

  function updateFilterCounts() {
    const counts = calculateCounts();
    if (countAll) countAll.textContent = counts.all;
    if (countImages) countImages.textContent = counts.images;
    if (countPng) countPng.textContent = counts.png;
    if (countJpg) countJpg.textContent = counts.jpg;
    if (countWebp) countWebp.textContent = counts.webp;
    if (countAvif) countAvif.textContent = counts.avif;
    if (countSvg) countSvg.textContent = counts.svg;
    if (countGif) countGif.textContent = counts.gif;
    if (countIco) countIco.textContent = counts.ico;
    if (countVideo) countVideo.textContent = counts.video;
    if (countAudio) countAudio.textContent = counts.audio;
    if (countFont) countFont.textContent = counts.font;

    updateDropdownButtonBadge(counts);
  }

  function updateDropdownButtonBadge(counts) {
    if (!counts) counts = calculateCounts();
    if (activeFilterBadge) {
      activeFilterBadge.textContent = counts[currentFilter] !== undefined ? counts[currentFilter] : 0;
    }
  }

  function updateVisibleStats() {
    const validAssets = allAssets.filter((a) => !a.failed);
    const filtered = validAssets.filter((asset) => assetMatchesFilter(asset, currentFilter));

    visibleStats.textContent = `SHOWING ${filtered.length} OF ${validAssets.length} ASSETS`;
    if (filtered.length === 0) {
      if (validAssets.length === 0) {
        emptyState.style.display = "flex";
        appFooter.style.display = "none";
      } else {
        emptyState.style.display = "none";
        assetGrid.innerHTML = `
          <div style="grid-column: 1 / -1; width: 100%; padding: 30px; text-align: center; color: #64748b; font-size: 11px;">
            No ${FILTER_LABELS[currentFilter] || currentFilter.toUpperCase()} assets found.
          </div>`;
        appFooter.style.display = "flex";
      }
    } else {
      emptyState.style.display = "none";
      appFooter.style.display = "flex";
    }
  }

  function renderAssets() {
    assetGrid.innerHTML = "";

    const validAssets = allAssets.filter((a) => !a.failed);
    const filtered = validAssets.filter((asset) => assetMatchesFilter(asset, currentFilter));

    if (filtered.length === 0) {
      updateVisibleStats();
      return;
    }

    emptyState.style.display = "none";
    appFooter.style.display = "flex";

    filtered.forEach((asset) => {
      try {
        const card = createAssetCard(asset);
        assetGrid.appendChild(card);
      } catch (cardErr) {
        console.error("Error creating card for asset:", asset, cardErr);
      }
    });

    updateVisibleStats();
  }

  function createAssetCard(asset) {
    const card = document.createElement("div");
    card.className = "asset-card";
    card.setAttribute("draggable", "true");
    card.title = `${asset.filename}\nClick RIP to import or save`;
    card.style.width = `${currentThumbSize}px`;

    const previewContainer = document.createElement("div");
    previewContainer.className = "card-preview";
    previewContainer.style.width = "100%";
    previewContainer.style.height = `${currentThumbSize}px`;

    // Format Badge
    const badge = document.createElement("span");
    const cleanExt = (asset.extension || "FILE").toLowerCase();
    badge.className = `badge-tag ${cleanExt}`;
    badge.textContent = asset.extension;
    previewContainer.appendChild(badge);

    const cat = getAssetFilterCategory(asset);

    // Media Preview per Category
    if (cat === "font") {
      const fontBox = document.createElement("div");
      fontBox.className = "font-preview";
      const fontName = extractFontDisplayName(asset.url, asset.filename);
      fontBox.innerHTML = `
        <span class="font-preview-letters">Aa</span>
        <span class="font-preview-name">${fontName}</span>
        <span class="font-preview-ext">${asset.extension}</span>
      `;
      previewContainer.appendChild(fontBox);
    } else if (cat === "video") {
      const ext = (asset.extension || "").toLowerCase();
      // Directly playable video extensions
      if (["mp4", "webm", "mov"].includes(ext)) {
        const vid = document.createElement("video");
        vid.src = asset.url;
        vid.muted = true;
        vid.loop = true;
        vid.preload = "metadata";
        vid.addEventListener("mouseenter", () => vid.play().catch(() => {}));
        vid.addEventListener("mouseleave", () => {
          vid.pause();
          vid.currentTime = 0;
        });
        vid.addEventListener("error", () => {
          card.remove();
          asset.failed = true;
          updateFilterCounts();
          updateVisibleStats();
        });
        previewContainer.appendChild(vid);
      } else {
        // Stream format card (m3u8, ts, mpd)
        const streamBox = document.createElement("div");
        streamBox.className = "audio-preview";
        streamBox.style.background = "#fff1f2";
        streamBox.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2"></rect>
          </svg>
          <span style="font-size:8.5px; color:#e11d48; font-weight:700;">${asset.extension} Stream</span>
        `;
        previewContainer.appendChild(streamBox);
      }

      const vidTag = document.createElement("span");
      vidTag.style.cssText = "position:absolute; bottom:6px; left:6px; color:#fff; background:rgba(0,0,0,0.7); padding:2px 4px; border-radius:3px; font-size:9px;";
      vidTag.textContent = "▶ Video";
      previewContainer.appendChild(vidTag);
    } else if (cat === "audio") {
      const audioBox = document.createElement("div");
      audioBox.className = "audio-preview";
      audioBox.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        <span style="font-size:8.5px; color:#0d9488; font-weight:700;">Audio Track</span>
      `;
      previewContainer.appendChild(audioBox);
    } else {
      // Images, SVGs, GIFs, WebP, AVIF, ICO
      const img = document.createElement("img");
      img.alt = asset.filename;
      img.loading = "lazy";

      img.addEventListener("error", () => {
        card.remove();
        asset.failed = true;
        updateFilterCounts();
        updateVisibleStats();
      });

      img.addEventListener("load", () => {
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          card.remove();
          asset.failed = true;
          updateFilterCounts();
          updateVisibleStats();
          return;
        }
        asset.dimensions = `${img.naturalWidth} × ${img.naturalHeight}`;
        if (dimLabel) {
          dimLabel.textContent = `${asset.dimensions} px`;
          dimLabel.title = `${asset.filename} (${asset.dimensions} px)`;
        }
      });

      img.src = asset.url;
      previewContainer.appendChild(img);
    }

    card.appendChild(previewContainer);

    // Card Meta Section below preview (Dimensions + RIP Button)
    const cardMeta = document.createElement("div");
    cardMeta.className = "card-meta";

    // Pixel Dimensions / Format Label
    const dimLabel = document.createElement("div");
    dimLabel.className = "card-dimensions";
    if (asset.dimensions) {
      dimLabel.textContent = `${asset.dimensions} px`;
      dimLabel.title = `${asset.filename} (${asset.dimensions} px)`;
    } else if (cat === "font") {
      dimLabel.textContent = `${asset.extension} Font`;
    } else if (cat === "audio") {
      dimLabel.textContent = `${asset.extension} Audio`;
    } else if (cat === "svg") {
      dimLabel.textContent = "Vector SVG";
    } else {
      dimLabel.textContent = `${asset.extension} File`;
    }

    // Dynamic resolution detection on video
    if (cat === "video") {
      const loadedVid = previewContainer.querySelector("video");
      if (loadedVid) {
        loadedVid.addEventListener("loadedmetadata", () => {
          if (loadedVid.videoWidth && loadedVid.videoHeight) {
            asset.dimensions = `${loadedVid.videoWidth} × ${loadedVid.videoHeight}`;
            dimLabel.textContent = `${asset.dimensions} px`;
          }
        });
      }
    }

    cardMeta.appendChild(dimLabel);

    // RIP Button
    const ripActionBtn = document.createElement("button");
    ripActionBtn.className = "btn-send-ps";
    ripActionBtn.title = "Rip asset into Photoshop or save";
    ripActionBtn.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      <span>RIP</span>
    `;
    ripActionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleRipAction(asset);
    });

    cardMeta.appendChild(ripActionBtn);
    card.appendChild(cardMeta);

    // Drag and Drop
    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer.setData("text/plain", asset.url);
      e.dataTransfer.setData("text/uri-list", asset.url);
      e.dataTransfer.effectAllowed = "copyMove";
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });

    return card;
  }

  // -------------------------------------------------------------
  // RIP Action Router (Canvas Placement, Dialogs, or File Saving)
  // -------------------------------------------------------------
  async function handleRipAction(asset) {
    const cat = getAssetFilterCategory(asset);

    // 1. Font Handling: Prompt save to disk + copy URL
    if (cat === "font") {
      showToast(`Downloading font...`);
      try {
        const resp = await fetch(asset.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buffer = await resp.arrayBuffer();

        let saved = false;
        if (uxpFs && uxpFs.getFileForSaving) {
          const suggested = asset.filename || `font_${Date.now()}.${asset.extension.toLowerCase()}`;
          const saveFile = await uxpFs.getFileForSaving(suggested, {
            types: [asset.extension.toLowerCase(), "woff2", "ttf", "otf", "woff", "eot"]
          });
          if (saveFile) {
            await saveFile.write(buffer, { format: uxpFormats.binary });
            saved = true;
          }
        }

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(asset.url);
          }
        } catch (e) {}

        if (saved) showToast(`Font saved to disk! (URL copied)`);
        else showToast(`Font URL copied to clipboard!`);
      } catch (err) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(asset.url);
          }
          showToast(`Font URL copied to clipboard!`);
        } catch (e) {
          showToast(`Error: ${err.message || err}`, true);
        }
      }
      return;
    }

    // 2. Audio Handling: Prompt save to disk + copy URL
    if (cat === "audio") {
      showToast(`Downloading audio...`);
      try {
        const resp = await fetch(asset.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buffer = await resp.arrayBuffer();

        let saved = false;
        if (uxpFs && uxpFs.getFileForSaving) {
          const suggested = asset.filename || `audio_${Date.now()}.${asset.extension.toLowerCase()}`;
          const saveFile = await uxpFs.getFileForSaving(suggested, {
            types: [asset.extension.toLowerCase(), "mp3", "wav", "m4a", "ogg", "aac", "opus", "weba"]
          });
          if (saveFile) {
            await saveFile.write(buffer, { format: uxpFormats.binary });
            saved = true;
          }
        }

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(asset.url);
          }
        } catch (e) {}

        if (saved) showToast(`Audio saved to disk! (URL copied)`);
        else showToast(`Audio URL copied to clipboard!`);
      } catch (err) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(asset.url);
          }
          showToast(`Audio URL copied to clipboard!`);
        } catch (e) {
          showToast(`Error: ${err.message || err}`, true);
        }
      }
      return;
    }

    // 3. Video Handling (MP4 / MOV: Open in Photoshop; Streams: Copy URL)
    if (cat === "video") {
      const ext = (asset.extension || "").toLowerCase();
      if (["mp4", "mov"].includes(ext) && psCore) {
        showToast(`Importing video into Photoshop...`);
        try {
          const tempFile = await downloadToTempFile(asset);
          await psCore.executeAsModal(
            async () => {
              if (psApp && psApp.open) {
                await psApp.open(tempFile);
              } else {
                await psAction.batchPlay(
                  [{ _obj: "open", target: { _path: tempFile.nativePath, _kind: "local" } }],
                  { interactionLevel: "displayDialogs", commandName: "RipperDoc: Open Video" }
                );
              }
            },
            { commandName: "RipperDoc: Open Video", interactionLevel: "displayDialogs" }
          );
          showToast(`Opened Video in Photoshop!`);
          return;
        } catch (vidErr) {
          console.warn("Could not open video directly in PS:", vidErr);
        }
      }

      // Fallback for m3u8, ts, mpd, or if PS rejected video open:
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(asset.url);
        }
        showToast(`Video URL copied to clipboard!`);
      } catch (e) {
        showToast(`Video URL: ${asset.url}`);
      }
      return;
    }

    // 4. Image, Vector SVG, Raster Graphics: Send directly into Photoshop!
    await placeAssetIntoPhotoshop(asset, false);
  }

  async function placeAssetIntoPhotoshop(asset, asNewDoc = false) {
    if (!psCore || !uxpFs) {
      showToast("Photoshop UXP APIs not connected", true);
      return;
    }

    showToast(`Downloading asset...`);

    try {
      const tempFile = await downloadToTempFile(asset);
      if (!tempFile) {
        showToast("Failed to prepare file", true);
        return;
      }

      const hasOpenDocs = psApp && psApp.documents && psApp.documents.length > 0;
      const isSvg = asset.type === "svg" || (tempFile.name && tempFile.name.endsWith(".svg"));

      if (asNewDoc || !hasOpenDocs) {
        // Open as new document - for SVGs, Photoshop displays its native Rasterize/Size dialog!
        await psCore.executeAsModal(
          async () => {
            if (psApp && psApp.open) {
              await psApp.open(tempFile);
            } else {
              await psAction.batchPlay(
                [
                  {
                    _obj: "open",
                    target: {
                      _path: tempFile.nativePath,
                      _kind: "local"
                    }
                  }
                ],
                { interactionLevel: "displayDialogs", commandName: "RipperDoc: Open Asset" }
              );
            }
          },
          { commandName: "RipperDoc: Open Asset", interactionLevel: "displayDialogs" }
        );
        showToast(`Opened in Photoshop!`);
      } else {
        // Attempt Place Layer into active document; for SVGs, allows transform/resize handles!
        try {
          await psCore.executeAsModal(
            async () => {
              const res = await psAction.batchPlay(
                [
                  {
                    _obj: "placeEvent",
                    null: {
                      _path: tempFile.nativePath,
                      _kind: "local"
                    },
                    freeTransformCenterState: {
                      _enum: "quadCenterState",
                      _value: "QCSAverage"
                    },
                    offset: {
                      _obj: "offset",
                      horizontal: { _unit: "pixelsUnit", _value: 0 },
                      vertical: { _unit: "pixelsUnit", _value: 0 }
                    }
                  }
                ],
                {
                  interactionLevel: "displayDialogs",
                  historyStateInfo: {
                    name: `RipperDoc: Place ${asset.extension}`
                  }
                }
              );

              if (res && res[0] && res[0]._obj === "error") {
                throw new Error(res[0].message || "Photoshop rejected placeEvent");
              }
            },
            { commandName: "RipperDoc: Place Layer", interactionLevel: "displayDialogs" }
          );
          showToast(`Placed into Photoshop!`);
        } catch (placeErr) {
          console.warn("placeEvent failed, falling back to open:", placeErr);
          // Fallback: Open file as document so the user always receives the asset with resize dialog
          await psCore.executeAsModal(
            async () => {
              if (psApp && psApp.open) {
                await psApp.open(tempFile);
              } else {
                await psAction.batchPlay(
                  [
                    {
                      _obj: "open",
                      target: {
                        _path: tempFile.nativePath,
                        _kind: "local"
                      }
                    }
                  ],
                  { interactionLevel: "displayDialogs", commandName: "RipperDoc: Open Asset" }
                );
              }
            },
            { commandName: "RipperDoc: Open Asset", interactionLevel: "displayDialogs" }
          );
          showToast(`Opened in Photoshop!`);
        }
      }
    } catch (err) {
      console.error("Error sending to Photoshop:", err);
      let msg = "Unknown error";
      if (err) {
        if (typeof err === "string") msg = err;
        else if (err.message) msg = err.message;
        else if (err.number) msg = `PS Error code ${err.number}`;
        else msg = JSON.stringify(err);
      }
      showToast(`Error: ${msg}`, true);
    }
  }

  async function downloadToTempFile(asset) {
    const tempFolder = await uxpFs.getTemporaryFolder();
    let cleanExt = (asset.extension || "png").toLowerCase();

    // 1. Inline SVG handling: Write full standalone XML document
    if (asset.isInlineSvg && asset.rawSvg) {
      let cleanSvg = asset.rawSvg.trim();
      if (!cleanSvg.includes("xmlns=")) {
        cleanSvg = cleanSvg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!cleanSvg.startsWith("<?xml")) {
        cleanSvg = '<?xml version="1.0" encoding="utf-8"?>\n' + cleanSvg;
      }
      const safeName = `ripperdoc_${Date.now()}_${Math.floor(Math.random() * 10000)}.svg`;
      const file = await tempFolder.createFile(safeName, { overwrite: true });
      await file.write(cleanSvg);
      return file;
    }

    // 2. Fetch external asset
    const resp = await fetch(asset.url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: Failed to download`);

    const cType = (resp.headers.get("content-type") || "").toLowerCase();

    // 3. External SVG handling
    if (cType.includes("svg") || cleanExt === "svg") {
      let svgText = await resp.text();
      svgText = svgText.trim();
      if (!svgText.includes("xmlns=")) {
        svgText = svgText.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!svgText.startsWith("<?xml")) {
        svgText = '<?xml version="1.0" encoding="utf-8"?>\n' + svgText;
      }
      const safeName = `ripperdoc_${Date.now()}_${Math.floor(Math.random() * 10000)}.svg`;
      const file = await tempFolder.createFile(safeName, { overwrite: true });
      await file.write(svgText);
      return file;
    }

    // 4. Raster & Media handling (Detect real extension)
    if (cType.includes("webp")) cleanExt = "webp";
    else if (cType.includes("avif")) cleanExt = "avif";
    else if (cType.includes("png")) cleanExt = "png";
    else if (cType.includes("jpeg") || cType.includes("jpg")) cleanExt = "jpg";
    else if (cType.includes("gif")) cleanExt = "gif";
    else if (cType.includes("x-icon") || cType.includes("vnd.microsoft.icon")) cleanExt = "ico";

    const buffer = await resp.arrayBuffer();
    const safeName = `ripperdoc_${Date.now()}_${Math.floor(Math.random() * 10000)}.${cleanExt}`;
    const file = await tempFolder.createFile(safeName, { overwrite: true });
    await file.write(buffer, { format: uxpFormats.binary });
    return file;
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------
  function setLoading(loading, message = "") {
    if (loading) {
      ripBtn.disabled = true;
      ripBtnText.textContent = "HARVESTING...";
      statusBanner.style.display = "flex";
      statusMessage.textContent = message;
    } else {
      ripBtn.disabled = false;
      ripBtnText.textContent = "HARVEST ASSETS";
      statusBanner.style.display = "none";
    }
  }

  let toastTimer = null;
  function showToast(msg, isError = false) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.style.borderColor = isError ? "#ef4444" : "#0284c7";
    toast.classList.add("show");
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }

  // Run initial setup
  init();
})();
