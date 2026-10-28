// RipperDoc - Asset Harvester for Photoshop
// Created by Nephuxs

(function () {
  // -------------------------------------------------------------
  // Photoshop / UXP API Imports
  // -------------------------------------------------------------
  let psApp = null;
  let psCore = null;
  let psAction = null;
  let uxpFs = null;
  let uxpFormats = null;

  try {
    const ps = require("photoshop");
    psApp = ps.app;
    psCore = ps.core;
    psAction = ps.action;

    const uxp = require("uxp");
    uxpFs = uxp.storage.localFileSystem;
    uxpFormats = uxp.storage.formats;
  } catch (err) {
    console.warn("RipperDoc running in standard browser/preview mode:", err);
  }

  // -------------------------------------------------------------
  // Supported Video & Audio Extensions
  // -------------------------------------------------------------
  const VIDEO_EXTS = ["mp4", "webm", "mov", "m4v", "avi", "mkv", "ogv", "flv", "wmv", "3gp", "ts"];
  const AUDIO_EXTS = ["mp3", "wav", "ogg", "aac", "flac", "m4a", "wma", "aiff", "opus", "mid", "midi"];

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
  const filterTabs = document.getElementById("filterTabs");
  const sizeSlider = document.getElementById("sizeSlider");
  const sizeValue = document.getElementById("sizeValue");
  const toast = document.getElementById("toast");
  const rebootBtn = document.getElementById("rebootBtn");

  // Tab counts
  const countAll = document.getElementById("countAll");
  const countPng = document.getElementById("countPng");
  const countJpg = document.getElementById("countJpg");
  const countSvg = document.getElementById("countSvg");
  const countGif = document.getElementById("countGif");
  const countVideo = document.getElementById("countVideo");
  const countAudio = document.getElementById("countAudio");

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

    // Filter tabs
    filterTabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".tab-btn");
      if (!tab) return;
      document.querySelectorAll(".tab-btn").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.getAttribute("data-filter");
      renderAssets();
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

  function rebootPlugin() {
    urlInput.value = "";
    allAssets = [];
    currentFilter = "all";

    // Reset active tab to ALL
    document.querySelectorAll(".tab-btn").forEach((t) => t.classList.remove("active"));
    const allTab = document.querySelector('.tab-btn[data-filter="all"]');
    if (allTab) allTab.classList.add("active");

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
      const extracted = parseHtmlAssets(html, baseUrl);

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

  function getExtension(url, fallbackType) {
    if (url.startsWith("data:image/svg+xml")) return "svg";
    if (url.startsWith("data:image/png")) return "png";
    if (url.startsWith("data:image/jpeg")) return "jpg";
    if (url.startsWith("data:image/gif")) return "gif";
    if (url.startsWith("data:image/webp")) return "webp";

    if (url.includes("images.unsplash.com")) return "jpg";

    const match = url.match(/\.([a-z0-9]{3,5})(?:[?#]|$)/i);
    if (match) return match[1].toLowerCase();

    if (fallbackType === "svg") return "svg";
    if (fallbackType === "video") return "mp4";
    if (fallbackType === "audio") return "mp3";
    return "png";
  }

  function categorizeAsset(url, ext, initialType) {
    const e = ext.toLowerCase();
    if (e === "png") return "png";
    if (e === "jpg" || e === "jpeg") return "jpg";
    if (e === "svg" || initialType === "svg") return "svg";
    if (e === "gif") return "gif";
    if (VIDEO_EXTS.includes(e) || initialType === "video") return "video";
    if (AUDIO_EXTS.includes(e) || initialType === "audio") return "audio";
    
    // Map other raster formats to PNG tab
    if (["webp", "avif", "bmp", "ico"].includes(e)) return "png";
    return "png";
  }

  function parseHtmlAssets(html, baseUrl) {
    const assetMap = new Map();

    function addAsset(rawUrl, type, meta = {}) {
      if (!rawUrl) return;
      rawUrl = rawUrl.trim().replace(/\\/g, ""); // unescape JSON slashes if present

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
                  extractAttr(tag, "data-lazy-src");
      const width = extractAttr(tag, "width");
      const height = extractAttr(tag, "height");
      const dims = (width && height) ? `${width} × ${height}` : null;
      if (src) addAsset(src, "image", { dimensions: dims });

      const srcset = extractAttr(tag, "srcset") || extractAttr(tag, "data-srcset");
      if (srcset) {
        parseSrcset(srcset).forEach((u) => addAsset(u, "image"));
      }
    }

    // 2. OpenGraph / Twitter <meta> tags
    const metaRegex = /<meta\b([^>]*)>/gi;
    while ((m = metaRegex.exec(html)) !== null) {
      const tag = m[1];
      const prop = extractAttr(tag, "property") || extractAttr(tag, "name");
      if (prop && /image/i.test(prop)) {
        const content = extractAttr(tag, "content");
        if (content) addAsset(content, "image");
      }
    }

    // 3. <picture> and <source> tags
    const sourceRegex = /<source\b([^>]*)>/gi;
    while ((m = sourceRegex.exec(html)) !== null) {
      const tag = m[1];
      const src = extractAttr(tag, "src");
      if (src) addAsset(src, "source");
      const srcset = extractAttr(tag, "srcset");
      if (srcset) {
        parseSrcset(srcset).forEach((u) => addAsset(u, "source"));
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
          filename: `inline_vector_${svgIdx}.svg`,
          dimensions: `${width} × ${height}`
        });
      } catch (e) {}
    }

    // 5. <link rel="*icon*">
    const linkRegex = /<link\b([^>]*)>/gi;
    while ((m = linkRegex.exec(html)) !== null) {
      const tag = m[1];
      const rel = extractAttr(tag, "rel");
      if (rel && /icon/i.test(rel)) {
        const href = extractAttr(tag, "href");
        if (href) addAsset(href, "image");
      }
    }

    // 6. <video> and <audio> tags
    const videoRegex = /<video\b([^>]*)>/gi;
    while ((m = videoRegex.exec(html)) !== null) {
      const src = extractAttr(m[1], "src");
      if (src) addAsset(src, "video");
    }

    const audioRegex = /<audio\b([^>]*)>/gi;
    while ((m = audioRegex.exec(html)) !== null) {
      const src = extractAttr(m[1], "src");
      if (src) addAsset(src, "audio");
    }

    // 7. Direct media links in text, JSON, or scripts (supports extensive list of video/audio)
    const mediaRegex = /https?:\/\/[^"'<>\s\\]+\.(?:png|jpe?g|gif|svg|webp|avif|mp4|webm|mov|m4v|avi|mkv|ogv|flv|wmv|3gp|ts|mp3|wav|ogg|aac|flac|m4a|wma|aiff|opus)(?:\?[^"'<>\s\\]*)?/gi;
    while ((m = mediaRegex.exec(html)) !== null) {
      addAsset(m[0], "link");
    }

    // 8. Unsplash and CDN photo URLs
    const unsplashRegex = /https?:\/\/images\.unsplash\.com\/photo-[a-zA-Z0-9\-_]+(?:\?[^"'<>\s\\]*)?/gi;
    while ((m = unsplashRegex.exec(html)) !== null) {
      addAsset(m[0], "image");
    }

    return Array.from(assetMap.values());
  }

  // -------------------------------------------------------------
  // Filter & Render
  // -------------------------------------------------------------
  function updateFilterCounts() {
    const validAssets = allAssets.filter((a) => !a.failed);
    const counts = { all: validAssets.length, png: 0, jpg: 0, svg: 0, gif: 0, video: 0, audio: 0 };
    validAssets.forEach((a) => {
      if (counts[a.type] !== undefined) counts[a.type]++;
    });

    if (countAll) countAll.textContent = counts.all;
    if (countPng) countPng.textContent = counts.png;
    if (countJpg) countJpg.textContent = counts.jpg;
    if (countSvg) countSvg.textContent = counts.svg;
    if (countGif) countGif.textContent = counts.gif;
    if (countVideo) countVideo.textContent = counts.video;
    if (countAudio) countAudio.textContent = counts.audio;
  }

  function updateVisibleStats() {
    const validAssets = allAssets.filter((a) => !a.failed);
    const filtered = validAssets.filter((asset) => {
      if (currentFilter !== "all" && asset.type !== currentFilter) return false;
      return true;
    });

    visibleStats.textContent = `SHOWING ${filtered.length} OF ${validAssets.length} ASSETS`;
    if (filtered.length === 0) {
      if (validAssets.length === 0) {
        emptyState.style.display = "flex";
        appFooter.style.display = "none";
      } else {
        emptyState.style.display = "none";
        assetGrid.innerHTML = `
          <div style="grid-column: 1 / -1; width: 100%; padding: 30px; text-align: center; color: #64748b; font-size: 11px;">
            No ${currentFilter.toUpperCase()} assets found.
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
    const filtered = validAssets.filter((asset) => {
      if (currentFilter !== "all" && asset.type !== currentFilter) return false;
      return true;
    });

    if (filtered.length === 0) {
      if (validAssets.length === 0) {
        emptyState.style.display = "flex";
        appFooter.style.display = "none";
      } else {
        emptyState.style.display = "none";
        assetGrid.innerHTML = `
          <div style="grid-column: 1 / -1; width: 100%; padding: 30px; text-align: center; color: #64748b; font-size: 11px;">
            No ${currentFilter.toUpperCase()} assets found.
          </div>`;
        appFooter.style.display = "flex";
      }
    } else {
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
    }

    visibleStats.textContent = `SHOWING ${filtered.length} OF ${validAssets.length} ASSETS`;
  }

  function createAssetCard(asset) {
    const card = document.createElement("div");
    card.className = "asset-card";
    card.setAttribute("draggable", "true");
    card.title = `${asset.filename}\nDrag into Photoshop or click RIP`;
    card.style.width = `${currentThumbSize}px`;

    const previewContainer = document.createElement("div");
    previewContainer.className = "card-preview";
    previewContainer.style.width = "100%";
    previewContainer.style.height = `${currentThumbSize}px`;

    // Format Badge
    const badge = document.createElement("span");
    badge.className = `badge-tag ${asset.extension.toLowerCase()}`;
    badge.textContent = asset.extension;
    previewContainer.appendChild(badge);

    // Media Preview
    if (asset.type === "video") {
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

      const vidTag = document.createElement("span");
      vidTag.style.cssText = "position:absolute; bottom:6px; left:6px; color:#fff; background:rgba(0,0,0,0.7); padding:2px 4px; border-radius:3px; font-size:9px;";
      vidTag.textContent = "▶ Video";
      previewContainer.appendChild(vidTag);
    } else if (asset.type === "audio") {
      const audioBox = document.createElement("div");
      audioBox.className = "audio-preview";
      audioBox.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        <span style="font-size:9px; color:#0d9488; font-weight:700;">Audio Track</span>
      `;
      previewContainer.appendChild(audioBox);
    } else {
      // Images, SVGs, GIFs
      const img = document.createElement("img");
      img.alt = asset.filename;
      img.loading = "lazy";
      
      // If image fails to load or cannot be previewed, exclude completely from displayed results!
      img.addEventListener("error", () => {
        card.remove();
        asset.failed = true;
        updateFilterCounts();
        updateVisibleStats();
      });

      img.addEventListener("load", () => {
        // Exclude empty / 0px images
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

    // Pixel Dimensions Label
    const dimLabel = document.createElement("div");
    dimLabel.className = "card-dimensions";
    if (asset.dimensions) {
      dimLabel.textContent = `${asset.dimensions} px`;
      dimLabel.title = `${asset.filename} (${asset.dimensions} px)`;
    } else if (asset.type === "svg") {
      dimLabel.textContent = "Vector SVG";
    } else if (asset.type === "audio") {
      dimLabel.textContent = "Audio File";
    } else {
      dimLabel.textContent = "-- px";
    }

    // Dynamic resolution detection on video
    if (asset.type === "video") {
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
    ripActionBtn.title = "Rip asset into active Photoshop document";
    ripActionBtn.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
      </svg>
      <span>RIP</span>
    `;
    ripActionBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      placeAssetIntoPhotoshop(asset, false);
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
  // Photoshop Integration (Place & Open with Fallback)
  // -------------------------------------------------------------
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
    else if (cType.includes("png")) cleanExt = "png";
    else if (cType.includes("jpeg") || cType.includes("jpg")) cleanExt = "jpg";
    else if (cType.includes("gif")) cleanExt = "gif";
    else if (cType.includes("avif")) cleanExt = "avif";

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
