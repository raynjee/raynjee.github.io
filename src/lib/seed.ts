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
  author: "Ἀνέκδοτα Editions",
  description:
    "A short multilingual travel essay that walks you through the studio. " +
    "Chapter 1 sets out from Kyoto in Japanese; Chapter 2 continues at a Seoul " +
    "market in Korean; Chapter 3 stops at a Chengdu teahouse told in Chinese; " +
    "Chapter 4 closes with fragments in French, Spanish, Russian, and Arabic " +
    "so the language auto-detector has something to chew on.",
};

// Each chapter reads as continuous book prose — 2-3 substantial paragraphs of
// flowing sentences, not a list of one-line fragments. This is what users will
// expect a translated novel to look like on screen.
const SAMPLE_CHAPTERS: SampleChapter[] = [
  {
    title: "I — 京都の朝 (Kyoto Morning)",
    paragraphs: [
      "京都の朝は、まだ薄暗いうちから始まります。私は二日目の朝、清水寺への石畳を歩きました。何百年も前から変わらない音が足もとに返ってきます。露に濡れた杉の扉をくぐると、ふと息を忘れるほど空気が冷たかった。ベンチに腰を下ろして、しばらく目を閉じて呼吸を整えました。それだけで、一日中ずっと座っていたいと思いました。",
      "寺を出ると、町はゆっくりと目覚め始めていました。路地の角にねずみがちょこんと座っています。どこかの軒先から、風鈴の音が聞こえてきました。帰り道、私は自分が旅行者であることを忘れそうになりました。京都の朝は、あなたを旅行者ではなく、ただの「人」として連れてきてくれるのです。",
      "夕方近くまで、私は街を歩いていました。何も買わず、何も撮らず、ただ歩いていただけです。それでも、家に戻るとき、ポケットの中には小さな石だけが入っていました。その石の重さが、その日いちばんの旅の思い出になりました。",
    ],
  },
  {
    title: "II — 서울 시장의 아침 (Seoul Market Morning)",
    paragraphs: [
      "서울 시장의 아침은 소리로 시작됩니다. 길거리 음식의 지지직거리는 소리, 상인들의 호객 소리, 자전거 벨 소리가 한 덩어리가 되어 골목 사이를 흘러갑니다. 발을 멈추면, 그 소리 한가운데에 내가 서 있다는 걸 깨닫습니다. 젊은 여자가 묵은 자리에서 김을 팔고 있었습니다. 그 손길은 세월만큼 단단해 보였지만, 얼굴에는 처음 보는 부드러운 미소가 있었습니다.",
      "비에 젖은 천막 위로 물방울이 똑, 똑 떨어졌습니다. 그 소리가 내 발걸음과 거의 같은 박자로 울렸습니다. 한 노파가 비닐 봉지를 샤악 개는 소리가 귓가에 꽂혔습니다. 서울의 시장은 아직도 마음대로 사진을 찍지 못하게 하는 곳입니다 — 눈으로만, 귀로만, 그리고 마음으로만 들어야 하는 곳이죠.",
      "시장이 끝날 무렵, 나는 국물 한 그릇을 사서 걸쭉하게 들이켰습니다. 손님은 나 혼자였지만, 테이블 위에는 이미 다른 사람들의 대화 조각이 흩어져 있었습니다. 서울 시장은 그 조각들을 모아서, 나에게도 나눠주는 곳입니다.",
    ],
  },
  {
    title: "III — 成都的茶馆 (A Chengdu Teahouse)",
    paragraphs: [
      "成都的早晨，是从茶馆开始的。我挑了巷子深处一家最不起眼的店，门口的竹椅上坐着一只懒洋洋的猫。老板递过来一盏盖碗茶——第一口生涩，第二口回甘，第三口的时候，我已经忘记了自己是来旅行的。柜台后面，有人用方言低声讲着什么,偶尔笑出声,那笑声比茶香更让人放松。",
      "我坐在角落里,看来人来人往。挑夫放下扁担,接过热茶,眉头一下就松开了;老太太拄着拐杖,和伙计絮絮叨叨,仿佛一辈子的话都要在今天说完。每个人的脸上,都写着不同的故事。我只是其中一页。",
      "离开的时候,我又回头看了一眼那只猫。它已经换了位置,但还是没有起来。我也该这样——再坐一会儿,再多喝一盏,再多听一段方言。然后,慢慢地,启程。成都是一座让人慢下来的城市,而茶馆是它最耐心的入口。",
    ],
  },
  {
    title: "IV — Varia (Fragments in Other Tongues)",
    paragraphs: [
      "Le voyage commence toujours par un pas hésitant, et finit par un sourire que l'on ne savait pas porter en partant. Cada ciudad tiene un ruido propio: Madrid suena a campanas lejanas, y Barcelona a mar vieja entre los muelles. Дорога длинна, а чай горяч; кто не спешит, тот всегда приходит вовремя. The ocean has taught me that home is not a wall but the people who understand your silence. السفر يعلّمنا أنّ البيت هو مَن يفهم صمتَك.",
      "And so the night closes where it began — at a small desk, with the next book waiting on the shelf. Il y a des matins où l'on ne sait pas pourquoi l'on est parti, et d'autres où l'on sait exactement pourquoi l'on rentre. Fin del viaje, comienza el recuerdo. Конец — это тоже начало, а начало почти всегда пахнет дождём. نهاية الرحلة هي فقط بداية الطريق التي لم تُكتب بعد.",
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
  return new File([blob], "anekdota-sample.epub", {
    type: "application/epub+zip",
  });
}
