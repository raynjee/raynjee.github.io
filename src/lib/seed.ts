// Seed a sample multilingual EPUB so first-time visitors can explore the
// studio without uploading their own. buildSampleEpub() returns a File that
// flows through the regular importEpubFile() pipeline — no special-case
// branch — so it exercises the same parser/OPF/SPINE/spinner code as a real
// .epub uploaded from disk.

import JSZip from "jszip";

interface SampleChapter {
  title: string;
  paragraphs: string[];
}

const SAMPLE_BOOK = {
  title: "The Studio Reader — Sample",
  author: "Atelier Editions",
  description:
    "A short multilingual travel essay that walks you through the studio. " +
    "Chapter 1 sets out from Kyoto in Japanese; Chapter 2 continues at a Seoul " +
    "market in Korean; Chapter 3 stops at a Chengdu teahouse told in Chinese; " +
    "Chapter 4 closes with fragments in French, Spanish, Russian, and Arabic " +
    "so the language auto-detector has something to chew on.",
};

const SAMPLE_CHAPTERS: SampleChapter[] = [
  {
    title: "I — 京都の朝 (Kyoto Morning)",
    paragraphs: [
      "Kyoto の朝は、まだ薄暗いうちから始まります。石畳を踏むと、もう何百年も前から変わらない音が返ってきます。",
      "二日目の朝、清水寺の境内は露に濡れていました。私はベンチに座り、しばらく目を閉じて、呼吸を整えました。",
      "寺を出ると、ねずみが路地の角にちょこんと座っていました。それがどこか、私の旅の相棒のように見えました。",
      "風鈴の音が、どこかの軒先から聞こえてきました。一日中、その音を聞きながら、街を歩いていました。",
    ],
  },
  {
    title: "II — 서울 시장의 아침 (Seoul Market Morning)",
    paragraphs: [
      "시장의 아침은 소리로 시작됩니다. 길거리 음식의 지지직거리는 소리, 상인들의 호객 소리, 자전거 벨 소리가 한 덩어리가 되어 골목 사이를 흘러갑니다.",
      "젊은 여자가 묵은 시장에서 김을 팔고 있었습니다. 그 손길은 세월만큼 단단해 보였지만, 얼굴에는 한번도 보지 못한 부드러운 미소가 있었습니다.",
      "비에 젖은 천막 위로 물방울이 똑, 똑 떨어졌습니다. 그 소리가 내 발걸음과 거의 같은 박자로 울렸습니다.",
      "한 노파가 비닐 봉지를 샤악 개는 소리가 귀에 꽂혔습니다. 그 소리는 서울의 진짜 목소리 같았습니다.",
    ],
  },
  {
    title: "III — 成都的茶馆 (A Chengdu Teahouse)",
    paragraphs: [
      "成都的早晨，是从茶馆开始的。我挑了巷子深处一家最不起眼的店，门口的竹椅上坐着一只懒洋洋的猫。",
      "老板递过来一盏盖碗茶。第一口生涩，第二口回甘，第三口的时候,我已经忘记了自己是来旅行的。",
      "茶馆里有人轻声讲着方言,偶尔笑出声。那笑声比茶香更让人放松。",
      "我坐在角落里,看来人来人往。每个人的脸上,都写着不同的故事。成都的茶馆,是故事的码头。",
    ],
  },
  {
    title: "IV — Varia (Fragments in Other Tongues)",
    paragraphs: [
      "French — Le voyage commence toujours par un pas hésitant, et finit par un sourire que l'on ne savait pas porter en partant. Le soir tombe doucement sur la place, et les réverbères s'allument un par un, comme des souvenirs qui reviennent.",
      "Spanish — Cada ciudad tiene un ruido propio. Madrid suena a campanas lejanas; Barcelona, a mar vieja entre los muelles. El viajero aprende a distinguir las ciudades por su acento antes que por su skyline.",
      "Russian — Дорога длинна, а чай горяч. Кто не спешит, тот всегда приходит вовремя. На вокзале пахнет хвоей и дымом — и это, пожалуй, самый честный запах путешествия.",
      "Arabic — السفر يعلّمنا أنّ البيت ليس جدارًا، بل هو الأشخاص الذين يفهمون صمتَك. البحر يمتدّ أمامنا، ونجلس نتأمّل كيف تتشابه الشواطئ في كلّ مكان.",
      "English — And so the journey closes where it began — at a small desk, in a quiet studio, with the next book waiting on the shelf.",
    ],
  },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function buildSampleEpub(): Promise<File> {
  const zip = new JSZip();

  // mimetype must be the first file in the archive AND must be uncompressed.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // Container manifest — points to the OPF inside OEBPS/.
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`,
  );

  // One XHTML file per chapter with <h1>title</h1> and a sequence of <p>.
  const itemRefs: Array<{ id: string; href: string; title: string }> = [];
  SAMPLE_CHAPTERS.forEach((chapter, idx) => {
    const id = `chap_${idx + 1}`;
    const href = `OEBPS/chap_${idx + 1}.xhtml`;
    const body = chapter.paragraphs
      .map((p) => `      <p>${escapeXml(p)}</p>`)
      .join("\n");
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="und">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(chapter.title)}</title>
</head>
<body>
<h1>${escapeXml(chapter.title)}</h1>
${body}
</body>
</html>
`;
    zip.file(href, xhtml);
    itemRefs.push({ id, href, title: chapter.title });
  });

  // EPUB 3 navigation document.
  const navItems = itemRefs
    .map(
      (r) =>
        `    <li><a href="${escapeXml(
          r.href.replace(/^OEBPS\//, ""),
        )}">${escapeXml(r.title)}</a></li>`,
    )
    .join("\n");
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>Contents</h1>
  <ol>
${navItems}
  </ol>
</nav>
</body>
</html>
`,
  );

  // OPF package document — describes metadata, manifest, and spine.
  const manifestItems = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    ...itemRefs.map(
      (r) =>
        `<item id="${escapeXml(r.id)}" href="${escapeXml(
          r.href.replace(/^OEBPS\//, ""),
        )}" media-type="application/xhtml+xml"/>`,
    ),
  ].join("\n  ");
  const spineItems = itemRefs
    .map((r) => `  <itemref idref="${escapeXml(r.id)}"/>`)
    .join("\n");
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `sample-${Date.now().toString(36)}`;

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(SAMPLE_BOOK.title)}</dc:title>
    <dc:creator>${escapeXml(SAMPLE_BOOK.author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:description>${escapeXml(SAMPLE_BOOK.description)}</dc:description>
    <meta property="dcterms:modified">${new Date()
      .toISOString()
      .replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
  ${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>
`,
  );

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
  });
  return new File([blob], "atelier-sample.epub", {
    type: "application/epub+zip",
  });
}
