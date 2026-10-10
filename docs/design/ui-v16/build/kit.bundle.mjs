// docs/design/ui-v16/build/kit-entry.jsx
import React5 from "react";
import { renderToStaticMarkup as R } from "react-dom/server";

// src/components.jsx
import React4, { useEffect as useEffect3, useRef as useRef3 } from "react";
import { X, Layers, Quote, Workflow, Flame } from "lucide-react";

// src/pixel.jsx
import React from "react";

// src/sprites-refs.js
var REF_SPRITES = {
  koromon: {
    name: "\u6EDA\u7403\u517D",
    stage: "\u5E7C\u5E74\u671F II",
    palette: { K: "#000002", A: "#2f2b2e", B: "#5a2022", C: "#e5669d", D: "#f2b5c7", E: "#fcdbe9", F: "#fcfffe" },
    frames: [
      [
        "...................K.....",
        "....K.............KEK....",
        "...KEK............KEK....",
        "...KEEK...........KEK....",
        "...KEEK...........KEEK...",
        "..KEEEK............KEEK..",
        ".KEDKK...............KEK.",
        "KEEKKKKK..........KKKKDDK",
        "KEDDDEEEK........KEEEDDDK",
        "KEEDDKKEEK......KEEKKDDK.",
        ".KDKK..KEKKKKKKKEEK..KK..",
        "..K....KEEEEEEEEEK.......",
        ".....KKEEEEEEEEEEEK......",
        "....KEEEEEEEEEEEEEEK.....",
        "...KEEKKKEEEEEEEKKKEK....",
        "...KEKKFFEEEEEEEAFFKEK...",
        "...KEKBKBKEEEEEKBKBKEK...",
        "..KEEKDFBKEEEEEKDFBKEEK..",
        "..KEEEKKKEEEEEEEKKKEEEK..",
        ".KEEEDDEEKKKKKKKEEDDEEEK.",
        ".KEEEKKKKAAAAAAAKKKKEEEK.",
        ".KEEEEKAFAAAAAAAFAKEEEEK.",
        ".KEEEEEKAAAAAAAAAKEEEEDK.",
        "..KDEEEKCCCCCCCCCKEEEDK..",
        "...KDDEEKCCCCCCCKEEEDK...",
        "....KKDEEKECCCEKEEEKK....",
        "......KKEEKEEEKEEKK......",
        "........KKKKKKKKK........"
      ]
    ]
  },
  agumon: {
    name: "\u4E9A\u53E4\u517D",
    stage: "\u6210\u957F\u671F",
    palette: { K: "#000104", A: "#229950", B: "#dd7b35", C: "#f7ad51", D: "#eede4c", E: "#fbfdfd" },
    frames: [
      [
        "...............KKKKKK......KKKKK.........................",
        ".............KKDDDDDDKKKKKKDDDDDKK.......................",
        "............KDDDDDDDDDKDDDDBBDDDDDK......................",
        "...........KDDDDDDDDDDDKDDDDDBBDDDDK.....................",
        "..........KKDDDDDDDDDDDDKDDDDDDDDDDK.....................",
        ".........KKBDDDDKKKKDDDDKDDDDDDDDKDK.....................",
        "........KBDDDDDKAAAAKDDDKDDDDDDDDDKK.....................",
        "........KBDDDKKAEKKEAKDDDDDDDDDDDDDKK....................",
        "........KBKDDDKAKKKEAKDDDDDDDDDDDDDDDKK..................",
        "........KBDDDDKAKKKKAKDDDDDDDDDDDDDDDDDK.................",
        "........KBDDDDKAKKKKAKKDDDDDDDDDDDDDDDDDK................",
        "........KBDDDDKAAKKAAKKDDDDDDDDDDDDDDDDDDK...............",
        "........KBDDDDDKAAAAKDDDDDDDDDDDDDDDDDDDDK...............",
        "........KBDDDDDDKKKKDDDDDDDDDDDDDKKDDDDDKDK..............",
        "........KBDDDDDDDDDDDDDDDDDDDDDDDDKDDDDDKDK..............",
        "........KBDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        "........KBBDDDDKDDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        "........KBBDDDDDKDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        ".........KBBDDDDDKKKKDDDDDEDDDDDDDDDDDDDDDK..............",
        "..........KBDDDDDEDDDKKKKKKKDDDDDDDDDDDDDK...............",
        "..........KBBDDDDDDDDEDDDDDDKKKDDDDDDDDDDK...............",
        "...........KBBDDDDDDDDDDDDDDDDDKKKKKKKKKK................",
        "............KBBBDDDDDDDDDDDDDDDD.DDDDDDDK................",
        ".............KKBKKDDDDDDDDDDDDDDDDDDDDDK.................",
        "..............KBBBKKBBBKKKKKBBBBBBBBBKK.........KKKK.....",
        "............KKKBBBBBBBBBBBBBKKKKKKKKK.........KKEEEEKKKK.",
        "...........KDDDBBBBBBBBBBBBBKKK............KKKEEEEKKEEEEK",
        "..........KDDDDDDDBBBBBBBKKKBDDK.........KKDDDKEEKKEEEKK.",
        "..........KDDDDDDDDDBBBBBBBBDDDDK.......KDDDDDDKKKBEEK...",
        ".........KDDDDDDDDDDDDDDDDDDDDDDDK.....KDDDDDBBKBBBKK....",
        ".........KDDDDBBDDDDDDDDDDDDDKDDDDK..KKDDDDDBKKBBBKKKKK..",
        "........KDDDDBKKDDDDDDDDDDDDDKBDDDDKKDDDDDDBKBBBBKBKEEEKK",
        ".......KDDDDDKBKDDDDDDDDDDDDDKBBDDDDKDDDDDDBBBBBBBBKEEEEK",
        "......KDDDDDKKBBKDDDDBBDDBBDDKKBBDDKDDDDDDBBBBBBBBBKKKKK.",
        "......KDDDDBKKBBBKKKBDDDDDBKKK.KBBDDDDDDBBBBBBBBBBKK.....",
        ".....KDDDDBKKBBBBBBBDDDDDDDBBK..KBBBDDBBBBBBBBKKKK.......",
        "....KDDDDDKEKBBDDDDDDDDDDDDDDBK..KBBBBBBBBKKKK...........",
        "....KDDDDDKEKBDDDDDDDDDDDDDDDDK...KBBBBKKK...............",
        "....KDDDDDDKBBDDDDDDDDDDDDDDDDK....KKKK..................",
        "...KDDDDDDDKBBDDDDDDDDDDDDDDDDK..........................",
        "...KDDDDDDDKBBDDDDDDDDDDDDDDDDK..........................",
        "..KBDDDDDDDKBBBDCDDDDDDDDDDDDDK..........................",
        "..KBDDDDDDDKBBBDDDDDDDDDDDDDDBK..........................",
        "..KBDDDDDBDDKBDKDDDDDDDDDDDDBBK..........................",
        "..KBDBDDDKDDKBDDKBDDDDDDDDDBBBDK.........................",
        "..KBDKDDDKDKKDDDDKBBBBBBBBKBBDDK.........................",
        "..KBDKDDDKKEKDDDDBBBBBBBKKBBBDDDK........................",
        "..KBDKBKKBKEKDDDDBKKKKKKBBBBBDDDK........................",
        "..KKKEKEEKKEKDDDBK......KBBBBDDDK........................",
        "...KEEKEEEKKKDDBBK.......KBBBBDDK........................",
        "...KEEKKEEKKBDBBK.......KBBBBBBK.........................",
        "....KEEKEEKBBBBBK.......KBBBBBBK.........................",
        ".....KEKKEKBBBBBBK.....KBBBBDDKKK........................",
        "......KKKKKDDDBBBK.....KBBBDDDDDDKKKKKK..................",
        "....KKBBBBKKKDDDBK.....KBBDDDDDKKDDDKBBK.................",
        "..KKBKKKBKDDDDDDBBK...KBBBDDDDDDDKBKEKBEK................",
        ".K..KKEBKEKDDDDDBBK...KBBBBDDDDDKEKEEEKEEK...............",
        "KE..KEEKEEEKDDBBBBK...KBBBBBBDDKEEEKEEEKEEK..............",
        "KEEKEEKEEEEKBBBBBBK....KBBBBBBBKEEEEKEEKKEK..............",
        "KKKKKKKKKKKKKKKKKK......KKKKKKKKKKKKKKKKKKK.............."
      ]
    ]
  },
  greymon: {
    name: "\u66B4\u9F99\u517D",
    stage: "\u6210\u719F\u671F",
    palette: { K: "#000202", A: "#582020", B: "#96193a", C: "#894528", D: "#1d569d", E: "#a4866b", F: "#d58d3c", G: "#db6a7b", H: "#f68b51", I: "#f4af58", J: "#fefdfd" },
    frames: [
      [
        "..............KK.......................................",
        ".............KEK....KK.................................",
        "............KEAK...KAK.................................",
        "...........KEAK...KAAK.................................",
        "..........KEEAK..KAEK...................K..............",
        ".........KEEAK...KAAK..................KEK.............",
        ".........KEAAK...KAAK..................KEK.............",
        "........KEEAK....KAKAK.................KEK.............",
        "........KEAAK....KKKKKKK..............KEEK.............",
        ".......KEEAAKK..KAKKEEEKKKKK..........KEAK.............",
        "......KKEEAKAEKKKKEEAKKEEEEAK.......KKEAAK.............",
        ".....KEEKKKAAAEEEEAAKEAAAAAAAK..K.KKKEAAAK.............",
        ".....KEEAAAAAAAAEAAKEAAKKKKAAAKKKKEEKAAAAK.............",
        "....KEEAAAAAAAAAAAAKAAKJBBKKAKEEKAAAKKAKK..............",
        "....KEAAAAAAAAAAAAAKAKIJKBKKAKAAKKAAAKK................",
        "....KKKKKKAAAAAAAAAAKKBKKJKAAKAAAKKKK..................",
        "....KJBBJBKAAAAAAAAAAKBBIKAAAAKKKK.....................",
        "....KJKBJKJKKKKKAAAAAAKKKAAAAKAAAKK....................",
        "....KKEGKKJBGJBBKKAAAAAAAAAAEKAAAAK....................",
        ".....KEK.KJKK.GKBJKKKKKKKAAEAAKAAAAK....KKKK...........",
        "......K...K.KJKBBJBBJJKEKKAAAAKKKKKK....KIIIKK.........",
        "............KKBBGJBBBJKIIKKAAAKIIIK......KKIIIKK.......",
        "...........KJKBGBBBBBGKIKKIKKKIDDDK........KIIIIK......",
        "..........KJKBGGBBGJGKKKDIIIFIDIIK..........KIIIIK.....",
        "........KKKJBGBBJGGJKDIIIDIIIIIIFK...........KIIDDK....",
        "........KJKBBBBBJJKKIIDIIDIIKIDDDK............KDDIIK...",
        "........KJBBJBGGKKIIIIDIIDIKIDIIDK............KDIIIK...",
        ".......KIKGGJJKKIDDIIIDIDDKHIIIDDK.............KIIIIK..",
        "........KIKKKKKIIIDIIDDIKIIEKIIDDIIK.KKK........KIDIIK..",
        ".........KHIIIIHIKKKKKKKHIIEKIDIIIIIKIIIK........KIIIIK.",
        "..........KHHHIKK.KKHHHHIIEKIIIIIIIIJJJIIK.......KIIIIK.",
        "...........KKKK....KHKIIIEKIIIIDIEKHKJEAIIIK......KIDDIIK",
        "..................KKKEKEKIIIIIIDHEKHHKJKIIIIIKK....KDDDDIK",
        ".................KIDIIIIIIIIDDEKHEKKKKIKEKIIIIIK...KDIIDDK",
        "..KKKK..........KIIDIIIHEKIIDDIEKHKIIEKIIIEKIAJIK...KIIIIDK",
        ".KJJIIK........KIIKDDHEKEKEKDDHHEKHKJIIIEKIEKIKJJIK..KIIIIIIK",
        "KJJIIIIKKKKKKKKIIIKIDEKIIIEKEKEKEKHKJJIIKKIIIKJKK..KIIIIIIIK",
        "KJKKIIIEKEKIIIIIIEKIHKHEKIIIIIIIHEKKKKKKDIKKKKKJJKKIIIIDIIIK",
        "KKJJKKIIIEKIIIIIIEKHKEKIIIIIIEKEKEKFHKIDDIIIIIKKKKDDIIIIIDIIK",
        "..KKKIIIKIIIEKIIIEKKKIIIIIIIIIIIIIIDIIIDDDIIIIIDDIIIIDIK.",
        ".KIIIIIKIIIEKHHHHK.KIIIIIIDIIIIIIDDIIIIIIIIIIIIDIIIIDIK.",
        "KJJIIIIKJIIKHKKK..KIDIIIIIDDDIIDDEKEKEKEKIIIIIIIIIDDIIIDIK.",
        "KJJIKKKJJIKKK....KDDIIIIIIIIDDDDEKIKIIEKEKIIIIIIIDDIIIDK..",
        "KJKK..KJKKK......KDIIIIIIIIIIIIEKDKIDDDDEKEKIIIDIIDIIIDK..",
        ".K....KJK......KKKIIDIIIIIDDIIEKDIKDDDDDDIEKKIDIIDIIIK...",
        ".......K......KDIKIDDIIIIIIIDDDHKDDIIIIDDIKIDIDDIIK....",
        ".............KDDDKDDIIIIIIIIIDDIKDIIIIIIIDKIDIDDIK.....",
        "............KIIIDDIIIIIIIIIIIIHHHIIDDDDIIIKIDIDDK......",
        "............KDIIIIKDHIIIIIIIIHHKHHDDDIADIIKIDIDK.......",
        "...........KIDDDIIEKKHHIIIIIHHHHKHHDEKIIEKIDIKDDKK........",
        "...........KIIIIDEKIHKHHHHHHHHHHKHDIEKIIEKHIKIDKK.........",
        "...........KIIEKIEKIIHHKIHHIHHHHHKHHEKIIIIEKKKKK...........",
        "............KIEKIEKEKHHKKKKHHHHHHHKHEKIIIIIEKIK.............",
        ".............KIIIIEKHHIK.KKKKKKKKKEKIIIIIIEKIK............",
        "..............KIIIIEKEKEKK.........KKIIIIHHEKIK............",
        "..............KKIIIIHHK..........KEKEKIHHEKIIK............",
        "........KKKKKKEKIIIIIIHK..........KHHEKEKHHIIIK...........",
        ".......KIIKKHIIEKIIIIIIHK.........KIIIIIIIIIK...........",
        "......KJHHHHIIIIEKEKEKIHHHK........KIIIHIIIIIIIK..........",
        ".....K.KJJIIKIIIIIIIHHHK.......KHIIIIIIIIIIIK..........",
        "....KEKJJEIKJJIIIIIHKKK.......KJJHHKJJIIIIJJK..........",
        "....KKKEKKKJJJIIKKKK.........KJJEHHKJEIIKIEJJK.........",
        "......KKKKEEKKKK.............KJEKKKKJEKK.KKEJK.........",
        ".........KKK.................KKK...KJKK....KEK.........",
        "....................................KK......KK........."
      ]
    ]
  },
  bakemon: {
    name: "\u731B\u9B3C\u517D",
    palette: { K: "#000001", A: "#b1042c", B: "#862a96", C: "#87858b", D: "#fcfeff" },
    frames: [
      [
        ".................KKKKKKKKK...................",
        "..............KKKDDDDDDDDDKK.................",
        "............KKDDDDDDDDDDDDDDKK...............",
        "...........KKDDDDDDDDDDDDDDDDKK..............",
        "..........KDDDDDDDDDDDDDDDDDDDDK.............",
        ".........KDDDDDDDDDDDDDDDDDDDDDDK............",
        ".........KDKKKDDDDDDDKKKDDDDDDDDDK...........",
        ".........KDKKKKDDDDCKKKKKDDDDDDDDK...........",
        "........KDKKKKKDDDDCKKKKKDDDDDDDDKK..........",
        "........KDKKKKKDDDDCKKKKKDDDDDDDDDK..........",
        "........KDDKKKDDDDDDDKKKDDDDDDDDDDK..........",
        "........KDDDDDDDDDDDDDDDDDDDDDDDDDDK.........",
        ".......KDDDKKKKKKKKKKKKKDDDDDDDDDDDK.........",
        ".......KDDKAAAAAAAAAAAAAKDDDDDDDDDDDK........",
        ".......KDDKDDKKDDKDCKDKKKDDDDDDDDDDDK........",
        "......KKDDKDKBKDKKDKKDBBKDDDDDDDDDDDK........",
        "....KKKKDDKDKBKDKKDKKDBBKDDDDDDDDDDDKC.......",
        "...KDDDDDDDKBBBKBKKBBKBBKDDDDDDDDDDDDK.......",
        "..KDDDDDDDDDKBBBBBBBBBBBKDKKDDDDDDDDDK.......",
        "..KDDDDDDDDDKBBBBAAAAAAKDDDDKKDDDDDDDDK......",
        ".KDDDDDDKDDKKBKAAAAKAAAKDKDDDDKDDDDDDDK......",
        ".KDDDDDDKDKDKKDKKCKDKAKDDKDDDDDDDDDDDDDK.....",
        "KDDDKDDDKDKDDKDKKDKDDKKDKDDDDDDDDDDDDDDK.....",
        "KDDDKKDKKDKAAAAAAAAAAKDKDDDDDDDDDDDKDDDDK....",
        "KDDDDKKKKDDKKKKKKKKKKDDKDDDDDKDDDDDKDDDDDK...",
        "KDDDDKK.KDDDDDDDDDDDDDKDDDDKKKDDDDDDDKDKDDKK.",
        "KDKDKK..KDDDDDDDDDDDDDKDDDKKDDDDDDKDDKDDDDDK.",
        "KDKKK...KDDDDDDDDDDDDDKDDDKDDDDDDDDKDDKDDDDK.",
        "KDKK....KDDDKDDDDDDDDDKDDKDDDDDDDKDKDDKDDDDK.",
        "KK.....KDDDDKKDDDDDDDDKDKDDDDDDDDKDKKDKKKDDD.",
        ".K.....KDDDDDDDDDDDDDDDKDDDDDDDKDDDDKDKKKKDDK",
        "......KDDDDDDDKDDDDDDDDDDKDDDDDKKDDDKDKKKKKDK",
        "......KDDDKDDKKDDDKDDDDDDKDDDDDKKDDDKKKDKKKKK",
        "......KDKDKDDKDDDDKDKDDKDDDDDDDKKDDDKKKK.C.KK",
        "......KKKDKDDKDDDDKDKDDKCDDDDDDKKDDDKKKK.C.KK",
        "......KKKDDDDKDDDDDDKDDKKKCDDDDKKKDDKKKK...K.",
        "........KDDDKKKDDDKDKKDKK.KDDKDKKKDDKKK......",
        "........KDDDCKKKDDKK.KDKK.KDDKDK.KDK.K.......",
        ".........KDDDK.KDDDK..KK...KDDDK.KDK.........",
        ".........KDKDK..KDDK...K...KKDK..KK..........",
        ".........KDKK....KDK........KDK..............",
        "..........KK.....KK.........KDK..............",
        ".................K..........KK..............."
      ]
    ]
  },
  numemon: {
    name: "\u5927\u4FBF\u517D",
    palette: { K: "#000101", A: "#186e43", B: "#923733", C: "#c23778", D: "#9aaf3f", E: "#8655ae", F: "#87858c", G: "#ea3d73", H: "#faaaad", I: "#fdfeff" },
    frames: [
      [
        ".......KKK......KKKK................",
        "......KIIIK....KIIIKK...............",
        ".....KIBBIIK..KIIBHIIK..............",
        ".....KIIKIIK..KIBKHIIK..............",
        ".....KIBBIIK..KIBBHIIK..............",
        ".....KIIIIAK..KIIIIAAK..............",
        "......KKKAK....KKKAKK...............",
        "........KDK......KDKK...............",
        "........KDKK.....KDKK...............",
        "........KDKK.....AK.................",
        ".........KDK....KDK.................",
        ".........KDK...KKDKKK...............",
        ".........KDKKKKKKDKKK...............",
        ".......KKDFEEEDDDDDAAK..............",
        ".....KKDDDDDDDDDDDDDDDK.............",
        "....KDDDDDDDDDDDDDDDDDEK............",
        "....KDAAAAAAADDDDDADDDEK............",
        "....KDKKKKKKKKDDDDKDDDEEKK..........",
        ".....KIKCIICCKKKKKIKKDDDDAK.........",
        ".....KIIKIIKKIIKKIIKKDDDDAK.........",
        "......KKAKKBBKKBBKBKKDDFFFK.........",
        "......KKDKBBBBBBBBBKKDDEEEK.........",
        ".......KKKBBBBBBBBBKKADEEEA.........",
        ".......KKKKKKKKKKKBBBKDDDDAK........",
        ".......KK.CKK....CKBBKDDDDAK........",
        ".......KK.CKK....CKBBKDDDDAK........",
        "......K..CK....CCCCKKKDDDDDK........",
        ".....K...K...CKCCKCKKKDDFEDAKK......",
        ".....K..K..CCKIKKIKIIKDDDDDAKK......",
        ".....K..K.GCCKKKKIKIIKDDDDDAKK......",
        "....KK.G.G.CKDDAKKKKKADDDDDDAKK.....",
        "....KK....CKKKDDDDDDDDDDDDADDAK.....",
        "....KK.G.CKAADKAADDDDDEEFDADDDAKKKKK",
        "...KKK...CKAADAAADDDDDEEFDADDDAKKKKK",
        "..KDDKCCCKADDDDDDDDDDDEEFDDKADDDDDDK",
        ".KDDDDKKKADDDDDDDDDDDDDDDDDDAAAAAAK.",
        "KDDAAAAAAAAAAADDDDDDDDAAAAADDDKKKK..",
        "KDDAAAAAAAAAAADDDDDDDDAAAAADDDKKKK..",
        "KKKKKKKKKKKKKKAAAAAAAAKKKKKKKK......",
        "..............KKKKKKKK.............."
      ]
    ]
  },
  mecha: {
    name: "\u673A\u68B0\u7CFB",
    palette: { K: "#010303", A: "#2e2c2f", B: "#6c3a2d", C: "#44464c", D: "#ac062b", E: "#16559c", F: "#84828d", G: "#e3ae50", H: "#f4937d", I: "#b4b0b8", J: "#e2e0ea", L: "#fcfdfd" },
    frames: [
      [
        ".....................................KKKKKK.................",
        ".............KKKKKK................KKIII.FIKK...............",
        "............KIIIJIFKKK............KIIIKK..CIIKK.............",
        "...........KIIKK.IIFIIK..........KI.FKFFK..KIIKK............",
        "..........KJJKFFKIIFFIIKK........K..KFKKKI.KIIIKKKK.........",
        "..........K.KFKKKKIIKFIKIK.......K..KFKKKI.KFFIKIKIK........",
        "..........K.KFKKKKIIKFFIAK....KK.KJ.KFKKKI.KFFKKIKDIK.......",
        "..........KIKFKKKI.IKFFKCIK...KCKKII.KKKIIIKFFKICKDKIK......",
        "..........KIIKKKII.KF.KIICK.KKKCCKFI...IIIKFF.KIAFKKIK......",
        "..........KFIIIIIIFKFFKIFFK.KCKKCCKCI.JIFKFFFKICFKFFFK......",
        "...........KFIIIIKKFFFKIFFKKKCCKKCAKKKKKKFFFFKICFKFAFK......",
        "............KKKKKFFFFKICFFKIKKCCKKCKFFFFFKKFIIKFFKFFFK......",
        ".............KFFFFFKKICFFKFIIKKCCKKCKKFFKIIKKKFFKKKKK.......",
        "..............KKFKKIICFFFKFICIKKCCKACKKKIICFFFFFKFKDK.......",
        "...............KKKFFF..KKFFFCFKCKCCKACKCKKFFFFFKFFKDK.......",
        "..................KKKKKKDKFAFFKCCKCAKCKCAAKKKKKFFAKK........",
        "......................KDKKKFFKCKKKAAAKCAAAKDKAKKKFK.........",
        ".......................KCKKKKKKCKKKKKKKKACKDDKFFFFK.........",
        "...................KKKKCAKKIIKCAKIIIIFFFKKKDKKKKKFFK........",
        "..................KIIK.CKKIKKCCKKKKKIIFFFFKKII.FKK.K........",
        ".................KDDKCCAKKKKCCAKKKKKKIFFFFKKKFFKKKKK...KKK..",
        ".................KHDKCCKIIKCACKFFIFKKIFFFKHHDFKIKIIFK.KIIIK.",
        "................KDDKAKKKKKCCAKKIICFKKIFFFKHDDKIKIICCK.KIIIFK",
        "................KKKCCCCCCCAKKKICFFAKKIFFKKDDDKIKIC.FFKKIIIFK",
        "................KCCCCCCCCAAAKIFCFCFKKIFFKIKKKIKIICFFKKKIIIFK",
        "...............KCCCCCCCCAKAAKFFAAFFKKIFFKIIIIIKIICFKKKCCCCFK",
        "..............KCCCCAACCKKKAAKFAFCFKKKIFFK.....KIICKKFKIIIFCK",
        ".............KCCCCCCCAKDKKAKKKFFKKIIKIFFKFFFFFKIICKFFKIIIFCK",
        "............KCCCCCCCAKDDKACKDKKKIIKKKIFFKIIIIIAIICFFCKCCIFFK",
        "...........K.FCIFFICCKKKACCKDKIIKKFKCIFIFKCCCCCKFFCCKIIICFAK",
        "...........KCCCCCCCCCKAAAACKKKKKIIKIIFFIFKFFFFFCKFFKKIIICFCK",
        "...........KCKACCCKKCCAAAKKIIIIIIKIIFFJFFFKKKKKKKKKKIIIIFAFK",
        "............KCCCCCCCACCKKKIKKKKKKFFFF.IFFFKKIIIIFAFKCCIFFAFK",
        "............KCCCCCCCAKKKKKKAKFFFFFII.FFFFKDKIKKIFCFKIICFFCK.",
        "............KCKKCKCCKKKCKCAAKFFFFFFFFFFFKDDKIGKIFCFKIICFCFK.",
        ".............KKCKCKCKAKACCAKKKKKKKKKKKKKDDKKIKKIFCKKKICFCFK.",
        ".............KCKCKCKAAAACKKDKFKFFKBKKKFFKKCKIIIIFKIFKKFAFK..",
        ".............KCCCCCCCAAAKFKDKKIKKKKDKIKKKKIKIKKKKKKKKIICFKAAFK..",
        "............KKKCCCCCCCKKFFKKIIKDDDKIKIKIKIKIKKI.IIIKKICIFKAFK...",
        "..........KKCCCKKKKKKKFFKKIIIIIKKKIIIKKKKI.IIIIFKICIFKF.K...",
        ".........KCCCCCCCCCCCKFKIIICIIFFCKIIIIIKI.IIIIFFKICFFKFK....",
        "........KCCCCCCCCCCCAKKIIIIIIFFCFKIIIIKI.CCCIFFKIKIFKFKK....",
        ".......KCKKKCCCCCCCKKKKKKIIIFFCFFKIIIKIJIIIIF.KIIFKKFFK.....",
        "......KCKCCCKCCCCCKKIIIIIKI.FCF.FKKKKIJIIIIFFKIIFFKFFK......",
        ".....KKKKFCCCKCCCKI..IIIIFKFFCFFFKIIKKKKKKKFFKIIFKFKFK.......",
        "....KIJIKKCCCKCCCKIIIIKKIFKFFCFKKIIKIFIIIIFKFIIFAGFKK........",
        "...KII.FFKCCCCKCCKKIIKKKIFKKKKKIIIIKI..CCCCIIKIFKGGFKFK.......",
        "...KI.F.FKKCCCCKCKKIIKKIIKIKFFFKKKI.IIIIIIIFKFKGFKFFK.......",
        "..K..FF.KKKKCCCAKKIKIIIIKI.KFFK.KIK.KKIIIIIIKFKKFKFFK.......",
        "..K.FFFKFFIIKCAKKKIIIIIFFKKFFFKKFCKKFKIIIIIIFKAFKF.K........",
        ".KIFFFKFI.IFKAK..KIKIKIFKFFFFKKFCCKFFKIIKKIIFKFKFFFK........",
        ".KIFKKF..IFFKK....KKKKKKKKKKKKFCCKFFCKIKFKIFFKKFFFFKK.......",
        "KI.KAF.IFFKK..........KKCCFFKFCCKFFCCKKFFKFFAKKKKKKFFK......",
        "KIKF.FFKKK............KIIKFKFCCKFFCCKFKFCKFAKF.FFFKKFK......",
        "KK.FFKK...............KKKKKKCCKKFCCKKKFCCKKKKKIIIKIFKK......",
        ".KKKK.............KKKKCCCCKCCKKFCCKIIKFCCK..KAKKKKKFFKK......",
        "...............KKKCKCCKCCKFCKKFCCKIIKFCCK..KCCACCCCKKKK......",
        "..............K.IKKCCKIKCKFKKKFCKIIIIK.CK..KCCCCCCCCCCCAK.....",
        ".............K.FK.IIKJIIKFCKKFCKKIIKFCK...KKCCKCCCKCKKCK.....",
        "............K.FK.FFKJIICKFKCKCKKKIIKFK...K.ICKCKKCKAJIKK.....",
        "............KKKKKKKIFFKKKKKKFCK..KFCK..K.IICKK.IKKAI.IK.....",
        "...............KK..KKK..K..KFK...KFK...KIIFKKK.IKKKCIIK.....",
        "...........................KK....KK....KIKK..KJIK..KKIK.....",
        "...........................K.....K.....KK.....FA.....KK.....",
        "..............................................KK............"
      ]
    ]
  }
};
Object.assign(REF_SPRITES, {
  "metalgreymon16": {
    "palette": {
      "K": "#000000",
      "A": "#522322",
      "B": "#34234e",
      "C": "#5e464b",
      "D": "#934842",
      "E": "#4a568b",
      "F": "#6b557f",
      "G": "#a86d51",
      "H": "#666f9a",
      "I": "#d25948",
      "J": "#9c8273",
      "L": "#dd8549",
      "M": "#d87469",
      "N": "#999a94",
      "O": "#e0a5ad",
      "P": "#cfd4cd"
    },
    "frames": [
      [
        "......................................K.................",
        ".....KK..............................KK.................",
        ".....KHK............................KHK.................",
        ".....KHEK...........................KEK.................",
        ".....KEEEK.........................KEEK.................",
        "......KEEEK.....................K..KEK..................",
        "......KEEEEK....................K.KEEK..................",
        ".......KEEHHK..................KK.KEEK..................",
        ".K.....KEHEHEK.................KBKKHEK..................",
        ".KKK....HHEEEEK................KBKEEK...................",
        "..KEKK..H.KEBEEK......K....K...KBKEEK..........K........",
        "..KEEEK.KK.KEBEEK....KK....K..KBBKEEK..........K........",
        "...KHEEK.EK.KEBEEK...KCK...IK.KBKEEKK.........KK........",
        "....KEEEKHEKKEEEHEK..KJK...II.BHIKEK.........KJKK.......",
        ".....KHEHHEHEHEEBEEK.KJK.K.IIMKFKBKC.........KJK........",
        ".....KHEEEKEEEEEEBEK.KCJKMMIIIMKNNNNKK.......KJKK.......",
        ".....KHHHKEKEEEEEEHB.KCJKKKIIMMNPNNKNNKK....KJJK........",
        "......KEH.KEKEEEEEEHH.KCJJJKKKNNNPNNKNNNK..KKCJKK.......",
        ".......KEK.KHKEEEEEEEK.KKJJCJJKCNNCNNKNNNKKJJJK.........",
        "........KEKKE.KEEEKKEBKKKKKCCCKCCCNNPNKKKPKKCJK.........",
        ".........HEEEKBKEEK.BEKIIIIKKFKCKKCNNPNNNNK.CJK.........",
        ".........CHHHHHHKHEKHHEKDDDDKKKCKPFJJJPJNCKFJJK.........",
        ".....KKKKKKBBBBBFKKHEKBEKIIMKNKCKEKCCNNPKNNCJK..........",
        "......KBBBBKKBHEBBHEEBHKMOIJKNKCKKEJCCNCPNNFJK..........",
        ".......KBBKKBKKBBBBBKBKIDDDMKNKCCCKCCCKNNPNNKK..........",
        "........KBB.KBBBKKBBBKKKDJGMKKKCCCCCCCCNNNNNNPK.........",
        ".........KBEHBBBEKCCHKJJKOMLKFJKACKJCKCJNNNNNPK.........",
        ".......KKKKKHHBBEBBBKLLLMOMMKNIKA.AKKCCFCNNNNNB.........",
        ".....KKLMLIIKKKKKKKKMLLLLJIDKMIKCCA.KJJFCNNNNNK.........",
        "...KKLLLLLLLLKK....KMLLLLGDMLKMKCDDCACKKCNNNPK..........",
        "..KLLLLLLLLLLLKK.KKLLADDKMMLLMELK.DDAK.KKCNNNK..........",
        ".KMLMDDILELLKKNNKLLLLLKKLMLLDGJLLKDDDAK.KKKNK...........",
        ".MMDDKKIMDLKNNNKLLKLIKDDKKMLDDJELLK.DA.K..KK............",
        "KMOKK..KHDDMKNCKLLMKKMIKFNNMLMIKHLK.DDCK................",
        "LMJ......KMLKCCKLLLDEMLKJNNKKMMMKLLK.AA.K...............",
        "LK.......KLILKKKKKLDELKCNCNPPKKKKKLLKKKMK...............",
        "K........KLIDDDKLLKLMLKCNINPNNNCNNKLLLLK................",
        "..........KIDDDKLLKLODDKJNNPNNKNNNKKKKK.................",
        "..........KIGMKKLNKLIKMLKFJJKKKJJKKJJK..................",
        "..........KMDKLLKPKLLLKLMKKKCNNKKKCNKKKKK...............",
        "...........KMKLLLKMMJPKKKKNKCNNKKIKKKPPPNK..............",
        "...........KMKLLLMKKKPKCNNNCCNNNKLEKCCCCPNKK............",
        "............KKNPKKHEHKLKKKKMKKMKKEMLKKNNCPCNK...........",
        ".............KKNKELLOKMMMOMMLLOMKIIHEEKCNCPNNK..........",
        "..............KKKMLLLKEEEMLLLLIELLEHLLMKKNCPPNK.........",
        "...............KLLHEMKDLLMLLLLLKLLELLLLKJCNNKKJK........",
        "..............KKMEHLOKEDMMLLLLMLLLLLLLLMKNNNNNPNNK......",
        ".............KLKEMLLMKLDDMLLLMDDLLLPOLLMMKKCNNNNNNK.....",
        ".............KLKELLLLKODDOLLLMDDIIIIMOOOMKKCNNNJNNK.....",
        ".............KLKLLLLLKLDGOGBBCKDDLLLLLLMLKCNFNNNNNNK....",
        "............KLIKLLLLLKKKKKK....KKKLLLLLLLKCNCKNCCPKK....",
        "...........KDILLLLLLMK.........KLDDILLLLLKCCKPKCNNPBK...",
        "...........KDDLLLLLLK..........KLILLLLLMK.KCKNPKNNNPKK..",
        "..........KDDDLKLLLLK.........KLILLLLLLK...KKCNPPNNNPNK.",
        "..........KIIMMGKLLL..........KMLLLILMK.....KCCPPKKNPKN.",
        "...........KLDDDDKKK.........KDDDLLLKK.......KCNNPKKNPNN",
        "...........KLLDLDK..........KIDDDLLK..........KCFPK.KNKB",
        "..........KILLLLLK.........KDMILDLK............KNNK..KK.",
        "..........KDILLOLK.........GDIIIDLK..............KK...K.",
        "..........KLIILILLK.......KLLLILLILCK.KK................",
        ".........KLLMLLLILLK.......KLMMLLLLIKKLMKK..............",
        ".........BPIKLLPKLLP........KGMLLLLLLLKLLLK.............",
        ".........NPLKDNPPKLPK........KMLLLLLLNPKLPPK............",
        ".........NPKKKNPPKKNK.........KLLDDDINNPKNNP............",
        ".........KKK..KKK..KK..........KKKKKKKKKKKKK............"
      ]
    ]
  },
  "machinedramon16": {
    "palette": {
      "K": "#010303",
      "A": "#2e2c2f",
      "B": "#6c3a2d",
      "C": "#44464c",
      "D": "#ac062b",
      "E": "#16559c",
      "F": "#84828d",
      "G": "#e3ae50",
      "H": "#f4937d",
      "I": "#b4b0b8",
      "J": "#e2e0ea",
      "L": "#fcfdfd"
    },
    "frames": [
      [
        ".................KKKKKK.....................................",
        "...............KKIF.IIIKK................KKKKKK.............",
        ".............KKIIC..KKIIIK............KKKFIJIIIK............",
        "............KKIIK..KFFKF.IK..........KIIFII.KKIIK...........",
        ".........KKKKIIIK.IKKKFK..K........KKIIFFIIKFFKJJK..........",
        "........KIKIKIFFK.IKKKFK..K.......KIKIFKIIKKKKFK.K..........",
        ".......KIDKIKKFFK.IKKKFK.JK.KK....KAIFFKIIKKKKFK.K..........",
        "......KIKDKCIKFFKIIIKKK.IIKKCK...KICKFFKI.IKKKFKIK..........",
        "......KIKKFAIK.FFKIII...IFKCCKKK.KCIIK.FK.IIKKKIIK..........",
        "......KFFFKFCIKFFFKFIJ.ICKCCKKCK.KFFIKFFKFIIIIIIFK..........",
        "......KFAFKFCIKFFFFKKKKKKACKKCCKKKFFIKFFFKKIIIIFK...........",
        "......KFFFKFFKIIFKKFFFFFKCKKCCKKIKFFCIKFFFFKKKKK............",
        ".......KKKKKFFKKKIIKFFKKCKKCCKKIIFKFFCIKKFFFFFK.............",
        ".......KDKFKFFFFFCIIKKKCAKCCKKICIFKFFFCIIKKFKK..............",
        ".......KDKFFKFFFFFKKCKCAKCCKCKFCFFFKK..FFFKKK...............",
        "........KKAFFKKKKKAACKCKACKCCKFFAFKDKKKKKK..................",
        ".........KFKKKAKDKAAACKAAAKKKCKFFKKKDK......................",
        ".........KFFFFKDDKCAKKKKKKKKCKKKKKKCK.......................",
        "........KFFKKKKKDKKKFFFIIIIKACKIIKKACKKKK...................",
        "........K.KKF.IIKKFFFFIIKKKKKCCKKIKKC.KIIK..................",
        "..KKK...KKKKKFFKKKFFFFIKKKKKKACCKKKKACCKDDK.................",
        ".KIIIK.KFIIKIKFDHHKFFFIKKFIFFKCACKIIKCCKDHK.................",
        "KFIIIK.KCCIIKIKDDHKFFFIKKFCIIKKACCKKKKKAKDDK................",
        "KFIIIKKFF.CIKIKDDDKKFFIKKAFFCIKKKACCCCCCCKKK................",
        "KFIIIKKKFFCIIKIKKKIKFFIKKFCFCFIKAAACCCCCCCCK................",
        "KFCCCCKKKFCIIKIIIIIKFFIKKFFAAFFKAAKACCCCCCCCK...............",
        "KCFIIIKFKKCIIK.....KFFIKKKFCFAFKAAKKKCCAACCCCK..............",
        "KCFIIIKFFKCIIKFFFFFKFFIKIIKKFFKKKAKKDKACCCCCCCK.............",
        "KFFICCKCFFCIIAIIIIIKFFIKKKIIKKKDKCAKDDKACCCCCCCK............",
        "KAFCIIIKCCFFKCCCCCKFIFICKFKKIIKDKCCAKKKCCIFFICF.K...........",
        "KCFCIIIKKFFKCFFFFFKFIFFIIKIIKKKKKCAAAAKCCCCCCCCCK...........",
        "KFAFIIIIKKKKKKKKKKFFFJFFIIKIIIIIIKKAAACCKKCCCAKCK...........",
        "KFAFFICCKFAFIIIIKKFFFI.FFFFKKKKKKIKKKCCACCCCCCCK............",
        ".KCFFCIIKFCFIKKIKDKFFFF.IIFFFFFKAKKKKKKACCCCCCCK............",
        ".KFCFCIIKFCFIKGIKDDKFFFFFFFFFFFKAACKCKKKCCKCKKCK............",
        ".KFCFCIKKKCFIKKIKKDDKKKKKKKKKKKKKACCAKAKCKCKCKK.............",
        "..KFAFKKFIKFIIIIKCKKFFKKKBKFFKFKDKKCAAAAKCKCKCK.............",
        "..KFAAKFCIIKKKKKKKEEKKKEKDKKKEKKDKFKAAACCCCCCCK.............",
        "...KFAKFICIKKIII.IKEEEEKIKDDDKIIKKFFKKCCCCCCCKKK............",
        "...K.FKFICIKFIIII.IKKKKIIIKKKIIIIIKKFFKKKKKKKCCCKK..........",
        "....KFKFFCIKFFIIII.IKIIIIIKCFFIICIIIKFKCCCCCCCCCCCK.........",
        "....KKFKFIKIKFFICCC.IKIIIIKFCFFIIIIIIKKACCCCCCCCCCCK........",
        ".....KFFKKFIIK.FIIIIJIKIIIKFFCFFIIIKKKKKKCCCCCCCKKKCK.......",
        "......KFFKFFIIKFFIIIIJIKKKKF.FCF.IKIIIIIKKCCCCCKCCCKCK......",
        ".......KFKFKFIIKFFKKKKKKKLKFFFCFFKFIIII..IKCCCKCCCFKKKK.....",
        "........KKFGAFIIFKFIIIIFIKLKKFCFFKFIKKIIIIKCCCKCCCKKIJIK....",
        ".......KFKFGGKFIKIICCCC..IKLLKKKKKFIKKKIIKKCCKCCCCKFF.IIK...",
        ".......KFFKFGKFKFIIIIIII.IKKKFFFKIKIIKKIIKKCKCCCCKKF.F.IK...",
        ".......KFFKFKKFKIIIIIIKK.KIK.KFFK.IKIIIIKIKKACCCKKKK.FF..K..",
        "........K.FKFAKFIIIIIIKFKKCFKKFFFKKFFIIIIIKKKACKIIFFKFFF.K..",
        "........KFFFKFKFIIKKIIKFFKCCFKKFFFFKFIKIKIK..KAKFI.IFKFFFIK.",
        ".......KKFFFFKKFFIKFKIKCFFKCCFKKKKKKKKKKKK....KKFFI..FKKFIK.",
        "......KFFKKKKKKAFFKFFKKCCFFKCCFKFFCCKK..........KKFFI.FAK.IK",
        "......KFKKFFF.FKAFKCFKFKCCFFKCCFKFKIIK............KKKFF.FKIK",
        "......KKFIKIIIKKKKKCCFKKKCCFKKCCKKKKKK...............KKFF.KK",
        "......KKFFKKKKKAK..KCCFKLKCCFKKCCKCCCCKKKK.............KKKK.",
        "......KKKKCCCCACCK..KCCFKLKCCFKKCFKCCKCCKCKKK...............",
        ".....KACCCCCCCCCCCK..KC.KLLKCFKKKFKCKIKCCKKI.K..............",
        ".....KCKKCKCCCKCCKK...KCFKLKKCFKKCFKIIJKII.KF.K.............",
        ".....KKIJAKCKKCKCI.K...KFKLKKKCKCKFKCIIJKFF.KF.K............",
        ".....KI.IAKKI.KKCII.K..KCFK..KCFKKKKKKFFIKKKKKKK............",
        ".....KIICKKKI.KKKFIIK...KFK...KFK..K..KKK..KK...............",
        ".....KIKK..KIJK..KKIK....KK....KK...........................",
        ".....KK.....AF.....KK.....K.....K...........................",
        "............KK.............................................."
      ]
    ]
  },
  "agumon16": {
    "palette": {
      "K": "#000103",
      "A": "#229950",
      "B": "#dd7c34",
      "C": "#f6ad4d",
      "D": "#efdc4c",
      "E": "#fbfdfd"
    },
    "frames": [
      [
        "...............KKKKKK......KKKKK.........................",
        ".............KKDDDDDDKKKKKKDDDDDKK.......................",
        "............KDDDDDDDDDKDDDDBBDDDDDK......................",
        "...........KDDDDDDDDDDDKDDDDDBBDDDDK.....................",
        "..........KKDDDDDDDDDDDDKDDDDDDDDDDK.....................",
        ".........KKBDDDDKKKKDDDDKDDDDDDDDKDK.....................",
        "........KBDDDDDKAAAAKDDDKDDDDDDDDDKK.....................",
        "........KBDDDKKAEKKEAKDDDDDDDDDDDDDKK....................",
        "........KBKDDDKAKKKEAKDDDDDDDDDDDDDDDKK..................",
        "........KBDDDDKAKKKKAKDDDDDDDDDDDDDDDDDK.................",
        "........KBDDDDKAKKKKAKKDDDDDDDDDDDDDDDDDK................",
        "........KBDDDDKAAKKAAKKDDDDDDDDDDDDDDDDDDK...............",
        "........KBDDDDDKAAAAKDDDDDDDDDDDDDDDDDDDDK...............",
        "........KBDDDDDDKKKKDDDDDDDDDDDDDKKDDDDDKDK..............",
        "........KBDDDDDDDDDDDDDDDDDDDDDDDDKDDDDDKDK..............",
        "........KBDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        "........KBBDDDDKDDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        "........KBBDDDDDKDDDDDDDDDDDDDDDDDDDDDDDDDK..............",
        ".........KBBDDDDDKKKKDDDDDEDDDDDDDDDDDDDDDK..............",
        "..........KBDDDDDEDDDKKKKKKKDDDDDDDDDDDDDK...............",
        "..........KBBDDDDDDDDEDDDDDDKKKDDDDDDDDDDK...............",
        "...........KBBDDDDDDDDDDDDDDDDDKKKKKKKKKK................",
        "............KBBBDDDDDDDDDDDDDDDD.DDDDDDDK................",
        ".............KKBKKDDDDDDDDDDDDDDDDDDDDDK.................",
        "..............KBBBKKBBBKKKKKBBBBBBBBBKK.........KKKK.....",
        "............KKKBBBBBBBBBBBBBKKKKKKKKK.........KKEEEEKKKK.",
        "...........KDDDBBBBBBBBBBBBBKKK............KKKEEEEKKEEEEK",
        "..........KDDDDDDDBBBBBBBKKKBDDK.........KKDDDKEEKKEEEKK.",
        "..........KDDDDDDDDDBBBBBBBBDDDDK.......KDDDDDDKKKBEEK...",
        ".........KDDDDDDDDDDDDDDDDDDDDDDDK.....KDDDDDBBKBBBKK....",
        ".........KDDDDBBDDDDDDDDDDDDDKDDDDK..KKDDDDDBKKBBBKKKKK..",
        "........KDDDDBKKDDDDDDDDDDDDDKBDDDDKKDDDDDDBKBBBBKBKEEEKK",
        ".......KDDDDDKBKDDDDDDDDDDDDDKBBDDDDKDDDDDDBBBBBBBBKEEEEK",
        "......KDDDDDKKBBKDDDDBBDDBBDDKKBBDDKDDDDDDBBBBBBBBBKKKKK.",
        "......KDDDDBKKBBBKKKBDDDDDBKKK.KBBDDDDDDBBBBBBBBBBKK.....",
        ".....KDDDDBKKBBBBBBBDDDDDDDBBK..KBBBDDBBBBBBBBKKKK.......",
        "....KDDDDDKEKBBDDDDDDDDDDDDDDBK..KBBBBBBBBKKKK...........",
        "....KDDDDDKEKBDDDDDDDDDDDDDDDDK...KBBBBKKK...............",
        "....KDDDDDDKBBDDDDDDDDDDDDDDDDK....KKKK..................",
        "...KDDDDDDDKBBDDDDDDDDDDDDDDDDK..........................",
        "...KDDDDDDDKBBDDDDDDDDDDDDDDDDK..........................",
        "..KBDDDDDDDKBBBDCDDDDDDDDDDDDDK..........................",
        "..KBDDDDDDDKBBBDDDDDDDDDDDDDDBK..........................",
        "..KBDDDDDBDDKBDKDDDDDDDDDDDDBBK..........................",
        "..KBDBDDDKDDKBDDKBDDDDDDDDDBBBDK.........................",
        "..KBDKDDDKDKKDDDDKBBBBBBBBKBBDDK.........................",
        "..KBDKDDDKKEKDDDDBBBBBBBKKBBBDDDK........................",
        "..KBDKBKKBKEKDDDDBKKKKKKBBBBBDDDK........................",
        "..KKKEKEEKKEKDDDBK......KBBBBDDDK........................",
        "...KEEKEEEKKKDDBBK.......KBBBBDDK........................",
        "...KEEKKEEKKBDBBK.......KBBBBBBK.........................",
        "....KEEKEEKBBBBBK.......KBBBBBBK.........................",
        ".....KEKKEKBBBBBBK.....KBBBBDDKKK........................",
        "......KKKKKDDDBBBK.....KBBBDDDDDDKKKKKK..................",
        "....KKBBBBKKKDDDBK.....KBBDDDDDKKDDDKBBK.................",
        "..KKBKKKBKDDDDDDBBK...KBBBDDDDDDDKBKEKBEK................",
        ".K..KKEBKEKDDDDDBBK...KBBBBDDDDDKEKEEEKEEK...............",
        "KE..KEEKEEEKDDBBBBK...KBBBBBBDDKEEEKEEEKEEK..............",
        "KEEKEEKEEEEKBBBBBBK....KBBBBBBBKEEEEKEEKKEK..............",
        "KKKKKKKKKKKKKKKKKK......KKKKKKKKKKKKKKKKKKK.............."
      ]
    ]
  },
  "gabumon16": {
    "palette": {
      "K": "#020001",
      "A": "#373538",
      "B": "#b60328",
      "C": "#884427",
      "D": "#334889",
      "E": "#b0046c",
      "F": "#bd454d",
      "G": "#3676cc",
      "H": "#04abe6",
      "I": "#d68d3f",
      "J": "#e0677b",
      "L": "#7786e1",
      "M": "#eaaf4a",
      "N": "#fbd948",
      "O": "#bbcde9",
      "P": "#fefefe"
    },
    "frames": [
      [
        ".....................K.....",
        ".............KK.....KK.....",
        ".............KDKK..KNK.....",
        ".............KDDDK.KNK.....",
        "..............KKOOKNIK.....",
        "..KKKKK..KKKKKKKKKKNMK.....",
        "...KDDDKKOOODDODDKNIIK.....",
        "....KDOOOOODDOOODDKNMAK....",
        ".....KKAAKKDOOOOODDKKDOK...",
        ".........KDDOKKKOODDDDOK...",
        ".........KLDOKBPKOOODOD....",
        ".........KODOKBKPKOOOODK...",
        "........KOOOD.FKBKOOOOOOK..",
        "........KDOOOOOODOOOOKKKDK.",
        "........KDOOOODDODDOOOKKOK.",
        "........KODOOOKOODOOOOOOOK.",
        ".......KOOOOOKNPKPKOOKKKPK.",
        ".......KDOOODNNNNNNKKNNKK..",
        ".......KDDOOONINNNNNNKK....",
        ".KKK...KODDDOINIIIIIKOK....",
        "KNNNK.KKOOOOKNNNNNNNKDDK...",
        ".KINNKKDDDOOKNNNHHHNKMOK...",
        "..KINNKOODDOKNNHJJJINKDDK..",
        "..KIIKDDDOOKINNHJHJINKDOOK.",
        "...KIKDOOOOKINHJHHHIHKMODK.",
        "...KIKOODDDKINHJJJJJHKMNDOK",
        "....KKOOOOOKNIHHJHJHIKMMOOK",
        ".....KEOOOOKNNIGJJJIKNKMOEK",
        ".....KKEEKEKNNKIGGIKNNKEKEK",
        ".....K.KEKEKINKKKKKINKKEKK.",
        "........KIKKIK...KIIIK.K...",
        "........KNNNNNK.KIIINMMK...",
        ".......KPNPNNPK.KIIIIPCPK..",
        ".......KKKKKKKK..KKKKKKKK.."
      ]
    ]
  }
});

// src/pixel.jsx
import { jsx, jsxs } from "react/jsx-runtime";
var INK = "var(--px-ink)";
var mono = (rows) => ({ palette: { X: "currentColor" }, frames: [rows] });
var SPRITES = {
  // 数码蛋：最初的对称椭圆（用户 2026-09-30 改回），与伙伴液晶屏里的蛋同一形状。
  egg: {
    palette: { X: INK, O: "var(--px-egg)", S: "var(--px-egg-spot)", H: "#fff" },
    frames: [
      [
        "....XXXX....",
        "..XXOOOOXX..",
        ".XOHOOOOOOX.",
        ".XHOOSSOOOX.",
        "XOOOSSSSOOOX",
        "XOOOOSSOOOOX",
        "XOSOOOOOOSOX",
        "XOSSOOOOSSOX",
        "XOOOOOOOOOOX",
        "XOOOSSSOOOOX",
        ".XOOSSSSOOX.",
        ".XOOOOOOOOX.",
        "..XXOOOOXX..",
        "....XXXX...."
      ]
    ]
  },
  // 滚球兽：按用户提供的 25×28 拼豆图纸逐格转录。
  koromon: {
    name: "\u6EDA\u7403\u517D",
    stage: "\u5E7C\u5E74\u671F II",
    palette: {
      K: INK,
      P: "#ffc9dd",
      Q: "#f6a3c0",
      M: "#e8589a",
      B: "#5b1f22",
      W: "#ffffff",
      D: "#2a2a2e"
    },
    frames: [
      [
        "...................K.....",
        ".....K............KPK....",
        "....KPK...........KPK....",
        "....KPPK..........KPK....",
        "....KPPK..........KPPK...",
        "...KPPPK...........KPPK..",
        "..KPQKK..............KPK.",
        "KPPKKKK...........KKKKQQK",
        "KPQQQPPPK........KPPPQQQK",
        "KPPQQKKPPK......KPPKKQQK.",
        ".KQKK..KPKKKKKKKPPK..KK..",
        "..K....KPPPPPPPPPK.......",
        ".....KKPPPPPPPPPPPK......",
        "....KPPPPPPPPPPPPPPK.....",
        "...KPPKKKPPPPPPPKKKPK....",
        "...KPKKWWPPPPPPDWWKPK....",
        "...KPKBKBKPPPPPKBKBKPK...",
        "..KPPKQWBKPPPPPKQWBKPPK..",
        "..KPPPKKKPPPPPPPKKKPPPK..",
        ".KPPPQQPPKKKKKKKPPQQPPPK.",
        ".KPPPKKKDDDDDDDDDKKKPPPK.",
        ".KPPPPKDWDDDDDDDWDKPPPPK.",
        ".KPPPPPKDDDDDDDDDKPPPPQK.",
        "..KQPPPKMMMMMMMMKPPPQK...",
        "...KQQPPKMMMMMMMKPPPQK...",
        "....KKQPPKPMMMPKPPKK.....",
        "......KKPPKPPPKPPKK......",
        "........KKKKKKKKK........"
      ]
    ]
  },
  agumon: {
    name: "\u4E9A\u53E4\u517D",
    stage: "\u6210\u957F\u671F",
    palette: { K: INK, O: "#ff9a1f", H: "#ffc46b", L: "#ffe0ad", W: "#fff", G: "#3fbf5a" },
    frames: [
      [
        "....KKKKKK......",
        "...KOHHOOOK.....",
        "..KOHOOOOOOK....",
        "..KOWGOOOOOOK...",
        "..KOWKOOOOOOOK..",
        "..KOOOOOOOOOOOK.",
        "..KOOOKWKWKWKK..",
        "...KOOOOOOOOK...",
        "....KKOOOOKK....",
        "...KOOKLLLLKOK..",
        "..KOOKLLLLLLKOK.",
        "..KWKKLLLLLLKWK.",
        "....KOLLLLLLOK..",
        "....KOOOKKOOOK..",
        "...KOOOK..KOOOK.",
        "...KKKK....KKKK."
      ],
      [
        "....KKKKKK......",
        "...KOHHOOOK.....",
        "..KOHOOOOOOK....",
        "..KOOOOOOOOOK...",
        "..KOKKOOOOOOOK..",
        "..KOOOOOOOOOOOK.",
        "..KOOOKWKWKWKK..",
        "...KOOOOOOOOK...",
        "....KKOOOOKK....",
        "...KOOKLLLLKOK..",
        "..KOOKLLLLLLKOK.",
        "..KWKKLLLLLLKWK.",
        "....KOLLLLLLOK..",
        "....KOOOKKOOOK..",
        "...KOOOK..KOOOK.",
        "...KKKK....KKKK."
      ]
    ]
  },
  // 八颗数码蛋：按用户提供的 68×37 拼豆图纸逐行转录（外形 14×16，配色取图纸色号）。
  egg1: {
    palette: { K: INK, o: "#ffd28a", O: "#ffab45", c: "#2672d6", n: "#1d2a8f" },
    frames: [
      [
        ".....KKKK.....",
        "....KooonK....",
        "...KoOOccnK...",
        "..KnOccOccnK..",
        "..KcOOcccOoK..",
        ".KnccOOOOOOoK.",
        ".KncccOOOOOoK.",
        "KnccccccccOOoK",
        "KnOOccccOOOOnK",
        "KoOOOOOOccccnK",
        "KoOOOOOOcccnnK",
        ".KoOccccccnnK.",
        ".KoOOccccOooK.",
        "..KnnOOooonK..",
        "...KnnnnnnK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg2: {
    palette: { K: INK, l: "#b9c2ff", v: "#dcd4ff", b: "#4b5ad9" },
    frames: [
      [
        ".....KKKK.....",
        "....KblllK....",
        "...KbvvvvbK...",
        "..KlvvbvvvbK..",
        "..KlvvbbvvbK..",
        ".KlvvbbbvvbbK.",
        ".KbvvvvvvvvlK.",
        "KlvbvvvvvvvblK",
        "KlbbvvbbvvvvlK",
        "KbbbvvvbvvbvbK",
        "KlvvvvbbbvvbbK",
        ".KlvvvvvvvvlK.",
        ".KbbbvvbbvvlK.",
        "..KbvvvbbbbK..",
        "...KlllbbbK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg3: {
    palette: { K: INK, a: "#ff9f68", r: "#ff4f63", x: "#ff3a2a" },
    frames: [
      [
        ".....KKKK.....",
        "....KraaaK....",
        "...KrraaraK...",
        "..KraaaarxrK..",
        "..KaaaaaaraK..",
        ".KaaaaaarrrrK.",
        ".KaaaaaaaaaaK.",
        "KarraaarrraaaK",
        "KarrraarraaaaK",
        "KarraaaraaaaaK",
        "KrrrraaaaarraK",
        ".KaaaaaaarrrK.",
        ".KraaaaaaarrK.",
        "..KrraaaaaaK..",
        "...KraaaarK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg4: {
    palette: { K: INK, p: "#fde6f0", e: "#f9c9e3", d: "#d596d6" },
    frames: [
      [
        ".....KKKK.....",
        "....KeeedK....",
        "...KepppddK...",
        "..KeppppdddK..",
        "..KeppdddddK..",
        ".KeppppppdddK.",
        ".KedddpppddeK.",
        "KddddpppppppeK",
        "KdddppppppppeK",
        "KdddddppppppeK",
        "KddddddppdppeK",
        ".KdddddppdppK.",
        ".KdpppppddddK.",
        "..KeppppdddK..",
        "...KeeedddK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg5: {
    palette: { K: INK, g: "#45cf33", c: "#fffbe2", L: "#c6f0a4" },
    frames: [
      [
        ".....KKKK.....",
        "....KLLLgK....",
        "...KgcccggK...",
        "..KggcccgggK..",
        "..KgggccccLK..",
        ".KLggccccccLK.",
        ".KLcccccggcLK.",
        "KLcccccggggcLK",
        "KLggcccggggcLK",
        "KggggccggcccgK",
        "KggggcccccccgK",
        ".KgggccccccLK.",
        ".KLccccggggLK.",
        "..KLcccggggK..",
        "...KLLLgggK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg6: {
    palette: { K: INK, w: "#fbf1dc", m: "#b98aa6", r: "#cdb0bd" },
    frames: [
      [
        ".....KKKK.....",
        "....KrrrrK....",
        "...KmwwwwmK...",
        "..KmmwwwmmmK..",
        "..KmwwwwmmmK..",
        ".KrwwwwwwmmrK.",
        ".KrwwwmmwwwwK.",
        "KrwwmmmmwwwwrK",
        "KrwwwmmwwwwwmK",
        "KrwwwmmwwwwmmK",
        "KmmwwwwwwwwmmK",
        ".KmmwwwwwwwrK.",
        ".KmmwwwwmwwrK.",
        "..KrwwwmmmmK..",
        "...KrrrmmmK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg7: {
    palette: { K: INK, y: "#fde36a", W: "#ffffff", a: "#fdf6c8" },
    frames: [
      [
        ".....KKKK.....",
        "....KaaaaK....",
        "...KyWWWWyK...",
        "..KyyyyyyyyK..",
        "..KayyyyyyaK..",
        ".KaWWWWWWWWaK.",
        ".KyWWWWWWWWyK.",
        "KyyyWWWWWWyyyK",
        "KyyyyyyyyyyyyK",
        "KayyyyyyyyyyaK",
        "KaWyyyyyyyyWaK",
        ".KaWWWWWWWWaK.",
        ".KyWWWWWWWyyK.",
        "..KyyyyyyyyK..",
        "...KyyyyyyK...",
        "....KKKKKK...."
      ]
    ]
  },
  egg8: {
    palette: { K: INK, p: "#fde6f0", e: "#f9c9e3", m: "#e8559a" },
    frames: [
      [
        ".....KKKK.....",
        "....KeemmK....",
        "...KepmmpeK...",
        "..KepmmpppeK..",
        "..KempppmmmK..",
        ".KmmpppmmppmK.",
        ".KeppppmmppmK.",
        "KeppppmppppmmK",
        "KemppppmpppmeK",
        "KmmmmppmpppmeK",
        "KeppmmpmmmmmeK",
        ".KeppmmmpppeK.",
        ".KeppmpppmmeK.",
        "..KepmppmmeK..",
        "...KemmemeK...",
        "....KKKKKK...."
      ]
    ]
  },
  // Prompt：像素对话框，三行文字与一个闪烁的光标。
  Prompt: {
    mode: "cursor",
    palette: {
      K: "currentColor",
      B: "var(--px-glyph-fill)",
      L: "#e6fbff",
      S: "color-mix(in srgb, currentColor 35%, #000)",
      W: "#ffffff",
      U: "#ffffff"
    },
    frames: [
      [
        ".KKKKKKKKKKKKKK.",
        "KWBBBBBBBBBBBBBK",
        "KBLLLLLLLLLBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLLLBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLUBBBBBBBK",
        "KBBBBBBUBBBBBBBK",
        "KSSSSSSSSSSSSSSK",
        ".KKKKSSKKKKKKKK.",
        "....KSK.........",
        "....KK.........."
      ],
      [
        ".KKKKKKKKKKKKKK.",
        "KWBBBBBBBBBBBBBK",
        "KBLLLLLLLLLBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLLLBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KBLLLLLBBBBBBBBK",
        "KBBBBBBBBBBBBBBK",
        "KSSSSSSSSSSSSSSK",
        ".KKKKSSKKKKKKKK.",
        "....KSK.........",
        "....KK.........."
      ]
    ]
  },
  // 工作流：三个节点经箭头依次连接；悬停时节点按顺序点亮，像信号沿流程流动。
  Workflow: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      P: "color-mix(in srgb, currentColor 55%, transparent)",
      L: "#ffffff"
    },
    frames: [0, 1, 2].map((lit) => [
      "................",
      ".KKKK...........",
      `.K${lit === 0 ? "LL" : "NN"}KPPPPPP.....`,
      `.K${lit === 0 ? "LL" : "NN"}K.....P.....`,
      ".KKKK.....P.....",
      ".........PPP....",
      "..........P.....",
      "........KKKKK...",
      `........K${lit === 1 ? "LLL" : "NNN"}K...`,
      `...PPPPPK${lit === 1 ? "LLL" : "NNN"}K...`,
      "...P....KKKKK...",
      "..PPP...........",
      "...P............",
      ".KKKKK..........",
      `.K${lit === 2 ? "LLL" : "NNN"}K..........`,
      ".KKKKK.........."
    ])
  },
  // 规则封面（用户 2026-09-30 与小角标对调）：lucide ScrollText 的像素版——左上卷起的轴头、
  // 三行条款、右下卷起的纸尾。描边 currentColor、填充 --px-glyph-fill，右侧一列阴影（P），条款依次点亮。
  Rule: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      P: "color-mix(in srgb, currentColor 40%, transparent)",
      Q: "color-mix(in srgb, currentColor 55%, transparent)",
      L: "#ffffff"
    },
    frames: [0, 1, 2].map((n) => {
      const clause = (on, row) => row.replace(/x/g, on ? "L" : "Q");
      return [
        "..KKKKKKKKKKK...",
        ".KNNKNNNNNNNPK..",
        ".KLNKNNNNNNNPK..",
        clause(n === 0, ".KNNKNxxxxxNPK.."),
        "..KKKNNNNNNNPK..",
        clause(n === 1, "....KNxxxxNNPK.."),
        "....KNNNNNNNPK..",
        clause(n === 2, "....KNxxxxxxPK.."),
        "....KNNNNNNNPK..",
        "....KNNKKKKKKKK.",
        "....KNNKLNNNNNPK",
        "....KNNKNNNNNNPK",
        ".....KKKKKKKKKK."
      ];
    })
  },
  // 规则小角标：原封面的展开卷轴（用户 2026-09-29 选定，2026-09-30 改作小角标）。
  // 上下轴有高光（L）与背光（P），纸面右侧一列阴影；小尺寸下由样式固定在第一帧。
  rule_scroll: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      P: "color-mix(in srgb, currentColor 40%, transparent)",
      Q: "color-mix(in srgb, currentColor 55%, transparent)",
      L: "#ffffff"
    },
    frames: [0, 1, 2].map((n) => {
      const clause = (on, len) => `..KN${(on ? "L" : "Q").repeat(len)}${"N".repeat(8 - len)}PK..`;
      return [
        ".KKKKKKKKKKKKKK.",
        "KLLNNNNNNNNNNPPK",
        "KLNNNNNNNNNNNNPK",
        ".KKKKKKKKKKKKKK.",
        "..KNNNNNNNNNNK..",
        clause(n === 0, 6),
        "..KNNNNNNNNNPK..",
        clause(n === 1, 7),
        "..KNNNNNNNNNPK..",
        clause(n === 2, 4),
        "..KNNNNNNNNNPK..",
        ".KKKKKKKKKKKKKK.",
        "KLLNNNNNNNNNNPPK",
        "KLNNNNNNNNNNNNPK",
        ".KKKKKKKKKKKKKK."
      ];
    })
  },
  // 焚决封面（切片 1.3）：像素火焰。描边 currentColor、外焰 --px-glyph-fill、内焰黄、焰心白；
  // 与其他资产封面同一套调色规则，悬停时三帧交替像火苗跳动。
  Scroll: {
    mode: "cycle",
    palette: {
      K: "currentColor",
      N: "var(--px-glyph-fill)",
      Y: "#ffd166",
      L: "#ffffff"
    },
    frames: [
      [
        "......K.........",
        "......KK........",
        ".....KNK....K...",
        ".....KNNK..KK...",
        "....KNNNK.KNK...",
        "...KNNNNNKKNNK..",
        "...KNNYNNNNNNK..",
        "..KNNNYYNNNNNNK.",
        "..KNNYYYYNNNNNK.",
        ".KNNNYYLYYNNNNK.",
        ".KNNYYLLLYYNNNK.",
        ".KNNYYLLLYYNNK..",
        "..KNNYYLYYNNNK..",
        "...KNNYYYNNNK...",
        "....KKNNNNKK....",
        "......KKKK......"
      ],
      [
        ".......K........",
        "......KK........",
        "......KNK...K...",
        ".....KNNK..KNK..",
        ".....KNNNK.KNK..",
        "....KNNNNNKNNK..",
        "...KNNNYNNNNNK..",
        "..KNNNNYYNNNNNK.",
        "..KNNNYYYNNNNNK.",
        ".KNNNYYLYYNNNNK.",
        ".KNNYYLLLYYNNNK.",
        ".KNNYYLLLYYNNK..",
        "..KNNYYLYYNNNK..",
        "...KNNYYYNNNK...",
        "....KKNNNNKK....",
        "......KKKK......"
      ],
      [
        "......K.........",
        ".....KK......K..",
        ".....KNK....KK..",
        "....KNNK...KNK..",
        "....KNNNK..KNK..",
        "...KNNNNNKKNNK..",
        "...KNNNYNNNNNK..",
        "..KNNNYYNNNNNNK.",
        "..KNNYYYYNNNNNK.",
        ".KNNNYYLYYNNNNK.",
        ".KNNYYLLLYYNNNK.",
        ".KNNYYLLLYYNNK..",
        "..KNNYYLYYNNNK..",
        "...KNNYYYNNNK...",
        "....KKNNNNKK....",
        "......KKKK......"
      ]
    ]
  },
  // 勇气之纹章（数码宝贝原作徽章，按像素参考图绘制）：品牌标志使用。
  crest: {
    palette: { O: "#ff8a24", L: "#ffc27a", Y: "#ffffff" },
    frames: [
      [
        "........O........",
        ".O......O......O.",
        "..OO...OOO...OO..",
        "..O...........O..",
        "......OOOOO......",
        ".....OO...OO.....",
        "....OO.LLL.OO....",
        "..O.O.L...L.O.O..",
        "OOO.O.L.Y.L.O.OOO",
        "..O.O.L...L.O.O..",
        "....OO.LLL.OO....",
        ".....OO...OO.....",
        "......OOOOO......",
        "..O...........O..",
        "..OO...OOO...OO..",
        ".O......O......O.",
        "........O........"
      ]
    ]
  },
  // 页面背景纹样（单色，取 currentColor，大尺寸低透明度使用）。
  mark_crest: mono([
    "........X........",
    ".X......X......X.",
    "..XX...XXX...XX..",
    "..X...........X..",
    "......XXXXX......",
    ".....XX...XX.....",
    "....XX.XXX.XX....",
    "..X.X.X...X.X.X..",
    "XXX.X.X.X.X.X.XXX",
    "..X.X.X...X.X.X..",
    "....XX.XXX.XX....",
    ".....XX...XX.....",
    "......XXXXX......",
    "..X...........X..",
    "..XX...XXX...XX..",
    ".X......X......X.",
    "........X........"
  ]),
  mark_egg: mono([
    "....XXXX....",
    "..XX....XX..",
    ".X...XX...X.",
    ".X..XXXX..X.",
    "X....XX....X",
    "X.XX....XX.X",
    "X.XX....XX.X",
    "X....XX....X",
    "X...XXXX...X",
    ".X...XX...X.",
    "..XX....XX..",
    "....XXXX...."
  ]),
  mark_agent: mono([
    ".....X......",
    ".....X......",
    "..XXXXXXXX..",
    ".X........X.",
    ".X.XX..XX.X.",
    ".X.XX..XX.X.",
    ".X........X.",
    ".X..XXXX..X.",
    ".X........X.",
    "..XXXXXXXX..",
    "...X....X...",
    "..XX....XX.."
  ]),
  mark_folder: mono([
    "............",
    ".XXXX.......",
    "X....X......",
    "X.....XXXXXX",
    "XXXXXXXXXXXX",
    "X..........X",
    "X..........X",
    "X..........X",
    "X..........X",
    "X..........X",
    "XXXXXXXXXXXX",
    "............"
  ]),
  mark_book: mono([
    "............",
    ".XXXX..XXXX.",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "X.XX.XX.XX.X",
    "X....XX....X",
    "XXXXXXXXXXXX",
    ".....XX.....",
    "............"
  ]),
  mark_pencil: mono([
    "..........XX",
    ".........X.X",
    "........X.X.",
    ".......X.X..",
    "......X.X...",
    ".....X.X....",
    "....X.X.....",
    "...X.X......",
    "..X.X.......",
    ".XXX........",
    ".XX.........",
    "X..........."
  ]),
  mark_flame: mono([
    ".....X......",
    ".....XX.....",
    "....X.X.....",
    "....X..X..X.",
    "...X...X.XX.",
    "..X.....XX.X",
    "..X........X",
    ".X....X....X",
    ".X...X.X...X",
    ".X...X.X..X.",
    "..X...X..X..",
    "...XXXXXX..."
  ]),
  mark_branch: mono([
    ".XX......XX.",
    "X..X....X..X",
    "X..X....X..X",
    ".XX......XX.",
    "..X.......X.",
    "..X......X..",
    "..X.....X...",
    "..X...XX....",
    "..XXXX......",
    ".XX.........",
    "X..X........",
    ".XX........."
  ]),
  mark_scan: mono([
    "XXX......XXX",
    "X..........X",
    "X..........X",
    "............",
    "....XXXX....",
    "...X....X...",
    "...X....X...",
    "....XXXX....",
    "............",
    "X..........X",
    "X..........X",
    "XXX......XXX"
  ]),
  mark_moon: mono([
    "....XXXX....",
    "..XXXX......",
    ".XXXX.......",
    ".XXX........",
    "XXXX........",
    "XXXX.....X..",
    "XXXX........",
    "XXXXX.......",
    ".XXXXX......",
    ".XXXXXXX..XX",
    "..XXXXXXXXX.",
    "....XXXXX..."
  ]),
  mark_gear: mono([
    "....XXXX....",
    "..X.XXXX.X..",
    ".XXXXXXXXXX.",
    "..XXX..XXX..",
    "XXXX....XXXX",
    "XXX......XXX",
    "XXX......XXX",
    "XXXX....XXXX",
    "..XXX..XXX..",
    ".XXXXXXXXXX.",
    "..X.XXXX.X..",
    "....XXXX...."
  ]),
  // 漂浮小符号
  bit_plus: mono(["..X..", "..X..", "XXXXX", "..X..", "..X.."]),
  bit_dia: mono(["..X..", ".X.X.", "X...X", ".X.X.", "..X.."]),
  bit_block: mono(["XX.", "XX.", "..X"])
};
SPRITES.Skill = SPRITES.egg1;
Object.assign(SPRITES, REF_SPRITES);
for (const key of ["bakemon", "mecha"])
  SPRITES[`mark_${key}`] = {
    palette: { X: "currentColor" },
    frames: [REF_SPRITES[key].frames[0].map((r2) => r2.replace(/[^.]/g, "X"))]
  };
function runs(rows, palette, dots = false) {
  const out = [];
  if (dots) {
    rows.forEach(
      (row, y) => [...row].forEach((ch, x) => {
        if (ch === "." || !palette[ch]) return;
        out.push(
          /* @__PURE__ */ jsx("circle", { cx: x + 0.5, cy: y + 0.5, r: 0.2, fill: palette[ch] }, `${y}-${x}`)
        );
      })
    );
    return out;
  }
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !palette[ch]) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      out.push(
        /* @__PURE__ */ jsx(
          "rect",
          {
            x,
            y,
            width: end - x + 0.02,
            height: 1.02,
            fill: palette[ch]
          },
          `${y}-${x}`
        )
      );
      x = end;
    }
  });
  return out;
}
function Pixel({ sprite, size = 48, fit, scale, crop, className = "", palette, title, dots = false }) {
  const art = SPRITES[sprite];
  if (!art) return null;
  const colors = { ...art.palette, ...palette };
  const rows = art.frames[0];
  const fullWidth = Math.max(...rows.map((r2) => r2.length));
  const [x0, y0, width, height] = crop || [0, 0, fullWidth, rows.length];
  if (scale) size = width * scale;
  else if (fit) size = fit * width / Math.max(width, height);
  return /* @__PURE__ */ jsx(
    "svg",
    {
      className: `pixel ${art.mode || (art.frames.length > 1 ? "animated" : "")} ${className}`,
      viewBox: `${x0} ${y0} ${width} ${height}`,
      width: size,
      height: size * height / width,
      shapeRendering: dots && width <= 20 ? "geometricPrecision" : "crispEdges",
      "aria-hidden": title ? void 0 : "true",
      role: title ? "img" : void 0,
      "aria-label": title,
      children: art.frames.map((frame, i) => /* @__PURE__ */ jsx("g", { className: `pixel-frame f${i}`, children: runs(frame, colors, dots && width <= 20) }, i))
    }
  );
}
function DigiviceArt({ children, size = 220, className = "" }) {
  const id = React.useId().replaceAll(":", "");
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `digivice-art ${className}`,
      style: { width: size, height: size },
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 200 200", width: size, height: size, children: [
          /* @__PURE__ */ jsxs("defs", { children: [
            /* @__PURE__ */ jsxs("linearGradient", { id: `${id}b`, x1: "0", y1: "0", x2: "1", y2: "1", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0", stopColor: "#1b2d4d" }),
              /* @__PURE__ */ jsx("stop", { offset: "1", stopColor: "#0a1426" })
            ] }),
            /* @__PURE__ */ jsxs("radialGradient", { id: `${id}s`, cx: ".5", cy: ".45", r: ".6", children: [
              /* @__PURE__ */ jsx("stop", { offset: "0", stopColor: "#10283a" }),
              /* @__PURE__ */ jsx("stop", { offset: "1", stopColor: "#07111d" })
            ] }),
            /* @__PURE__ */ jsxs("filter", { id: `${id}g`, x: "-20%", y: "-20%", width: "140%", height: "140%", children: [
              /* @__PURE__ */ jsx("feGaussianBlur", { stdDeviation: "2.2", result: "blur" }),
              /* @__PURE__ */ jsxs("feMerge", { children: [
                /* @__PURE__ */ jsx("feMergeNode", { in: "blur" }),
                /* @__PURE__ */ jsx("feMergeNode", { in: "SourceGraphic" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("g", { className: "dv-antenna", children: [
            /* @__PURE__ */ jsx("rect", { x: "22", y: "10", width: "9", height: "16", rx: "3", transform: "rotate(-28 26 18)" }),
            /* @__PURE__ */ jsx("rect", { x: "24.5", y: "24", width: "4", height: "8", transform: "rotate(-28 26 28)" })
          ] }),
          /* @__PURE__ */ jsx(
            "path",
            {
              className: "dv-body",
              fill: `url(#${id}b)`,
              d: "M60 24 H140 Q168 24 176 50 L178 70 Q190 76 190 100 Q190 124 178 130 L176 150 Q168 176 140 176 H60 Q32 176 24 150 L22 130 Q10 124 10 100 Q10 76 22 70 L24 50 Q32 24 60 24 Z"
            }
          ),
          /* @__PURE__ */ jsxs("g", { className: "dv-lines", filter: `url(#${id}g)`, children: [
            /* @__PURE__ */ jsx("path", { d: "M60 24 H140 Q168 24 176 50 L178 70 Q190 76 190 100 Q190 124 178 130 L176 150 Q168 176 140 176 H60 Q32 176 24 150 L22 130 Q10 124 10 100 Q10 76 22 70 L24 50 Q32 24 60 24 Z" }),
            /* @__PURE__ */ jsx(
              "path",
              {
                className: "dv-inner",
                d: "M62 31 H138 Q162 31 169 53 L171 73 Q182 79 182 100 Q182 121 171 127 L169 147 Q162 169 138 169 H62 Q38 169 31 147 L29 127 Q18 121 18 100 Q18 79 29 73 L31 53 Q38 31 62 31 Z"
              }
            ),
            /* @__PURE__ */ jsx("rect", { x: "66", y: "16", width: "22", height: "12", rx: "3" }),
            /* @__PURE__ */ jsx("rect", { x: "112", y: "16", width: "22", height: "12", rx: "3" }),
            /* @__PURE__ */ jsx("rect", { x: "66", y: "172", width: "22", height: "12", rx: "3" }),
            /* @__PURE__ */ jsx("rect", { x: "112", y: "172", width: "22", height: "12", rx: "3" }),
            /* @__PURE__ */ jsx("path", { d: "M38 44 L56 58 M162 44 L144 58 M38 156 L56 142 M162 156 L144 142" }),
            /* @__PURE__ */ jsx("circle", { cx: "100", cy: "100", r: "66" }),
            /* @__PURE__ */ jsx("circle", { cx: "100", cy: "100", r: "48" })
          ] }),
          /* @__PURE__ */ jsx("g", { className: "dv-code", children: /* @__PURE__ */ jsx("circle", { cx: "100", cy: "100", r: "57" }) }),
          /* @__PURE__ */ jsx("g", { className: "dv-arrows", children: /* @__PURE__ */ jsx("path", { d: "M53 86 l-5 -3 m5 3 l-5 3 M147 114 l5 -3 m-5 3 l5 3" }) }),
          /* @__PURE__ */ jsx("circle", { cx: "100", cy: "100", r: "46", fill: `url(#${id}s)`, className: "dv-bezel" }),
          /* @__PURE__ */ jsxs("g", { className: "dv-circuit", children: [
            /* @__PURE__ */ jsx("path", { d: "M66 82 h8 v-6 M66 118 h8 v6 M134 82 h-8 v-6 M134 118 h-8 v6 M84 62 v8 h6 M116 62 v8 h-6 M84 138 v-8 h6 M116 138 v-8 h-6 M62 100 h6 M132 100 h6" }),
            /* @__PURE__ */ jsx("circle", { cx: "74", cy: "76", r: "1.4" }),
            /* @__PURE__ */ jsx("circle", { cx: "126", cy: "76", r: "1.4" }),
            /* @__PURE__ */ jsx("circle", { cx: "74", cy: "124", r: "1.4" }),
            /* @__PURE__ */ jsx("circle", { cx: "126", cy: "124", r: "1.4" })
          ] }),
          /* @__PURE__ */ jsx("rect", { x: "71", y: "71", width: "58", height: "58", rx: "7", className: "dv-lcd-frame", filter: `url(#${id}g)` }),
          /* @__PURE__ */ jsxs("g", { className: "dv-buttons", filter: `url(#${id}g)`, children: [
            /* @__PURE__ */ jsx("circle", { cx: "24", cy: "100", r: "11" }),
            /* @__PURE__ */ jsx("circle", { cx: "24", cy: "100", r: "6" }),
            /* @__PURE__ */ jsx("ellipse", { cx: "176", cy: "80", rx: "11", ry: "9" }),
            /* @__PURE__ */ jsx("ellipse", { cx: "176", cy: "80", rx: "6", ry: "4.5" }),
            /* @__PURE__ */ jsx("ellipse", { cx: "176", cy: "120", rx: "11", ry: "9" }),
            /* @__PURE__ */ jsx("ellipse", { cx: "176", cy: "120", rx: "6", ry: "4.5" })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "digivice-lcd", children })
      ]
    }
  );
}
var CRESTS = [
  {
    name: "\u52C7\u6C14",
    color: "#ff8a24",
    d: "M20 1 L22.6 9.5 H17.4 Z M20 39 L22.6 30.5 H17.4 Z M1 20 L9.5 17.4 V22.6 Z M39 20 L30.5 17.4 V22.6 Z M7 7 L10.2 12.6 L12.6 10.2 Z M33 7 L29.8 12.6 L27.4 10.2 Z M7 33 L10.2 27.4 L12.6 29.8 Z M33 33 L29.8 27.4 L27.4 29.8 Z",
    circles: [[20, 20, 7.5], [20, 20, 3]]
  },
  {
    name: "\u7231\u5FC3",
    color: "#ff4d4d",
    d: "M20 35 L8 22 C3 16 6 7 13 7 C17 7 20 10 20 13 C20 10 23 7 27 7 C34 7 37 16 32 22 Z M13.5 18 C9.5 16.5 10 11 14 11 C17 11 17.2 15 14.3 15",
    circles: [[27, 14.5, 4], [27, 14.5, 1.8]]
  },
  {
    name: "\u5149\u660E",
    color: "#ff7ad1",
    d: [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r2 = (v, k) => {
        const t = a * Math.PI / 180;
        const [x, y] = v;
        return `${(20 + x * Math.cos(t) - y * Math.sin(t)).toFixed(2)} ${(20 + x * Math.sin(t) + y * Math.cos(t)).toFixed(2)}`;
      };
      return `M${r2([0, -18.5])} L${r2([2.6, -11])} L${r2([0, -6.8])} L${r2([-2.6, -11])} Z`;
    }).join(" "),
    circles: [[20, 20, 3.4]]
  },
  {
    name: "\u8BDA\u5B9E",
    color: "#e9eeff",
    d: "M17.5 2 H22.5 V16.5 H34 V21.5 H22.5 V38 H17.5 V21.5 H6 V16.5 H17.5 Z M9 3 H15 V14 Z M31 3 H25 V14 Z M9 37 H15 V26 Z M31 37 H25 V26 Z"
  },
  {
    name: "\u53CB\u60C5",
    color: "#3d8bff",
    d: "M20 11.5 C14 16 26 24 20 28.5 M11.8 22 Q7 25.5 1.5 25.5 Q8 21 12.1 17.6 M28.2 18 Q33 14.5 38.5 14.5 Q32 19 27.9 22.4",
    circles: [[20, 20, 8.5]]
  },
  {
    name: "\u7EAF\u771F",
    color: "#35d05a",
    d: "M20 3 L27.6 24.5 A8.6 8.6 0 1 1 12.4 24.5 Z",
    circles: [[20, 28, 5], [20, 28, 2.2]]
  },
  {
    name: "\u5E0C\u671B",
    color: "#ffd23f",
    d: "M20 1 L21.4 4.6 H18.6 Z M28.5 4.5 L27.2 8.2 L25.6 6.6 Z M11.5 4.5 L12.8 8.2 L14.4 6.6 Z M31 12 L27.3 12.8 L27.3 10.6 Z M9 12 L12.7 12.8 L12.7 10.6 Z M15.6 14.8 L12.6 37 L15.6 33 L18.1 37 L20.6 33 L23.1 37 L25.6 33 L27.6 37 L24.4 14.8",
    circles: [[20, 11, 4.6]]
  },
  {
    name: "\u77E5\u8BC6",
    color: "#a66bff",
    d: "M16.8 18.6 Q20.5 15.8 24.4 18.6",
    circles: [[10.5, 20, 7], [10.5, 20, 3.4], [30, 20, 6], [30, 20, 2.8]]
  }
];

// src/Odometer.jsx
import React2, { useEffect, useRef, useState } from "react";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";

// src/v14.jsx
import React3, { useEffect as useEffect2, useRef as useRef2, useState as useState2 } from "react";
import { Fragment, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var G = {
  0: "01110100011001110101110011000101110",
  1: "00100011000010000100001000010001110",
  2: "01110100010000100010001000100011111",
  3: "11111000100010000010000011000101110",
  4: "00010001100101010010111110001000010",
  5: "11111100001111000001000011000101110",
  6: "00110010001000011110100011000101110",
  7: "11111000010001000100010000100001000",
  8: "01110100011000101110100011000101110",
  9: "01110100011000101111000010001001100",
  " ": "00000000000000000000000000000000000",
  "-": "00000000000000011111000000000000000",
  A: "01110100011000111111100011000110001",
  B: "11110100011000111110100011000111110",
  C: "01110100011000010000100001000101110",
  D: "11100100101000110001100011001011100",
  E: "11111100001000011110100001000011111",
  F: "11111100001000011110100001000010000",
  G: "01110100011000010111100011000101111",
  H: "10001100011000111111100011000110001",
  I: "01110001000010000100001000010001110",
  J: "00111000100001000010000101001001100",
  K: "10001100101010011000101001001010001",
  L: "10000100001000010000100001000011111",
  M: "10001110111010110101100011000110001",
  N: "10001110011010110011100011000110001",
  O: "01110100011000110001100011000101110",
  P: "11110100011000111110100001000010000",
  Q: "01110100011000110001101011001001101",
  R: "11110100011000111110101001001010001",
  S: "01111100001000001110000010000111110",
  T: "11111001000010000100001000010000100",
  U: "10001100011000110001100011000101110",
  V: "10001100011000110001100010101000100",
  W: "10001100011000110101101011010101010",
  X: "10001100010101000100010101000110001",
  Y: "10001100010101000100001000010000100",
  Z: "11111000010001000100010001000011111",
  ".": "00000000000000000000000000110001100",
  "\xB7": "00000000000000001100011000000000000",
  ":": "00000011000110000000011000110000000",
  "/": "00001000100001000100010000100010000",
  "+": "00000001000010011111001000010000000",
  "?": "01110100010000100010001000000000100",
  "!": "00100001000010000100001000000000100",
  "#": "01010010101111101010111110101001010",
  "%": "11000110010001000100010001001100011",
  "(": "00010001000100001000010000010000010",
  ")": "01000001000001000010000100010001000",
  "&": "01100100101010001000101011001001101"
};
function LcdText({ text, px = 3, pad = 0, boot = false, label, className = "", style }) {
  const value = String(text ?? "").toUpperCase().padStart(pad, " ");
  const gap = px >= 5 ? 1 : px >= 3 ? 0.6 : 0.35;
  const w = Math.max(1, value.length * 6 - 1) * px, h2 = 7 * px;
  const on = [], off = [];
  [...value].forEach((ch, i) => {
    const g = G[ch] || G[" "];
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 5; x++) {
        const col = i * 6 + x;
        (g[y * 5 + x] === "1" ? on : off).push(
          /* @__PURE__ */ jsx3("rect", { x: col * px, y: y * px, width: px - gap, height: px - gap, style: { "--c": col } }, `${col}-${y}`)
        );
      }
  });
  const named = label !== null;
  return /* @__PURE__ */ jsx3("span", { className: `lcd-num ${className}`, style, children: /* @__PURE__ */ jsxs3(
    "svg",
    {
      width: w,
      height: h2,
      viewBox: `0 0 ${w} ${h2}`,
      role: named ? "img" : void 0,
      "aria-label": named ? label || String(text ?? "").trim() : void 0,
      "aria-hidden": named ? void 0 : "true",
      children: [
        /* @__PURE__ */ jsx3("g", { fill: "currentColor", opacity: ".1", children: off }),
        /* @__PURE__ */ jsx3("g", { className: boot ? "on" : void 0, fill: "currentColor", children: on })
      ]
    }
  ) });
}
function Corners() {
  return /* @__PURE__ */ jsxs3(Fragment, { children: [
    /* @__PURE__ */ jsx3("span", { className: "corner tl", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx3("span", { className: "corner tr", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx3("span", { className: "corner bl", "aria-hidden": "true" }),
    /* @__PURE__ */ jsx3("span", { className: "corner br", "aria-hidden": "true" })
  ] });
}

// src/pages.js
var MATURITY = {
  ready: "\u53EF\u7528",
  partial: "\u90E8\u5206\u53EF\u7528",
  draft: "\u8349\u7A3F",
  planned: "\u89C4\u5212\u4E2D"
};
var PAGES = [
  {
    id: "home",
    group: "\u4ECA\u65E5",
    code: "00",
    label: "\u4E16\u754C\u603B\u89C8",
    title: "\u4E16\u754C\u603B\u89C8",
    eyebrow: "TODAY \xB7 BASE",
    maturity: "ready",
    lead: "\u4ECA\u5929\u7684\u5B89\u6392\u3001\u5F85\u5904\u7406\u548C\u5E38\u7528\u5165\u53E3\uFF0C\u6BCF\u5929\u4ECE\u8FD9\u91CC\u5F00\u59CB\u3002"
  },
  {
    id: "inbox",
    group: "\u4ECA\u65E5",
    // 入口在顶栏与今日页；侧栏不重复，给伙伴屏留出空间。
    navHidden: true,
    code: "IN",
    label: "\u5F85\u5904\u7406",
    title: "\u5F85\u5904\u7406",
    eyebrow: "INBOX",
    maturity: "ready",
    lead: "\u9700\u8981\u4F60\u5224\u65AD\u7684\u4E8B\u9879\u6C47\u603B\u5728\u8FD9\u91CC\uFF0C\u5230\u5BF9\u5E94\u9875\u9762\u5904\u7406\u3002",
    bounds: ["\u53EA\u6C47\u603B\u4E0E\u8DF3\u8F6C", "\u4EC5\u672C\u673A\u53EF\u8BFB\u7EBF\u7D22"],
    stage: "\u6C47\u603B \xB7 \u8DF3\u8F6C",
    plan: {
      will: [
        "\u6C47\u603B\u80FD\u529B\u4F53\u68C0\u7ED3\u679C\u3001\u77E5\u8BC6\u6574\u7406\u5019\u9009\u3001\u6539\u7248\u5019\u9009\u3001\u56DE\u6536\u53D1\u73B0\u3001\u591C\u95F4\u7ED3\u679C\u3001\u534F\u540C\u9000\u56DE\u3002",
        "\u6BCF\u6761\u4E8B\u9879\u9644\u5E26\u6765\u6E90\u3001\u5EFA\u8BAE\u52A8\u4F5C\u548C\u5F71\u54CD\uFF0C\u70B9\u51FB\u8DF3\u5230\u5BF9\u5E94\u9875\u9762\u5904\u7406\u3002"
      ],
      route: "\u8DEF\u7EBF 2.2\uFF08\u7B2C\u4E00\u7248\uFF09\xB7 3.4\uFF08\u6269\u5C55\uFF09",
      needs: "\u968F\u5404\u529F\u80FD\u4E0A\u7EBF\u9010\u7C7B\u63A5\u5165\uFF1B\u672C\u8EAB\u4E0D\u6267\u884C\u4EFB\u4F55\u52A8\u4F5C\u3002"
    }
  },
  {
    id: "assets",
    group: "\u8D44\u4EA7",
    code: "01",
    label: "\u8D44\u4EA7\u4ED3\u5E93",
    title: "\u8D44\u4EA7\u4ED3\u5E93",
    eyebrow: "ASSET LIBRARY",
    maturity: "ready",
    lead: "Skill\u3001Prompt\u3001\u5DE5\u4F5C\u6D41\u3001\u89C4\u5219\u6A21\u677F\u4E0E\u711A\u51B3\u5728\u8FD9\u91CC\u6536\u5F55\u4E0E\u8FED\u4EE3\uFF0C\u590D\u5236\u540E\u4EA4\u7ED9\u4EFB\u610F Agent\uFF0C\u89C4\u5219\u8FD8\u80FD\u88C5\u8FDB\u9879\u76EE\u3002",
    stage: "\u6536\u96C6 \xB7 \u8FED\u4EE3 \xB7 \u4EA4\u4ED8"
  },
  {
    id: "references",
    group: "\u8D44\u4EA7",
    code: "02",
    label: "\u9006\u5411\u5DE5\u7A0B",
    title: "\u9006\u5411\u5DE5\u7A0B",
    eyebrow: "REVERSE ENGINEERING",
    maturity: "ready",
    lead: "\u628A\u597D\u5185\u5BB9\u62C6\u7ED9 Agent \u5206\u6790\uFF0C\u6C89\u6DC0\u4E3A\u711A\u51B3\u6216 Prompt\u3002",
    bounds: ["!\u62A5\u544A\u7ECF\u4F60\u786E\u8BA4\u624D\u5165\u5E93"],
    stage: "\u6295\u7D20\u6750 \xB7 \u62C6\u89E3 \xB7 \u5165\u5E93"
  },
  {
    id: "agents",
    group: "\u76EE\u6807",
    code: "03",
    label: "\u667A\u80FD\u4F53\u7FA4",
    title: "\u667A\u80FD\u4F53\u7FA4",
    eyebrow: "SELECT AGENT",
    maturity: "partial",
    lead: "\u9009\u4E00\u4F4D\u4F19\u4F34\uFF0C\u63A5\u7740\u505A\u6CA1\u505A\u5B8C\u7684\u4E8B\u3002",
    bounds: ["\u4F1A\u8BDD\u53EA\u5728\u672C\u673A\u8BFB\u53D6", "\u590D\u5236\u524D\u5148\u9884\u89C8"],
    stage: "\u53D1\u73B0 \xB7 \u7BA1\u7406 \xB7 \u63A5\u529B"
  },
  {
    id: "projects",
    group: "\u76EE\u6807",
    code: "04",
    label: "\u9879\u76EE\u7A7A\u95F4",
    title: "\u9879\u76EE\u7A7A\u95F4",
    eyebrow: "PROJECTS",
    maturity: "ready",
    lead: "\u6BCF\u4E2A\u5728\u63A8\u8FDB\u7684\u9879\u76EE\u662F\u4E00\u5F20\u5B58\u6863\uFF1A\u63A5\u529B\u5230\u54EA\u3001\u4E0B\u4E00\u6B65\u505A\u4EC0\u4E48\u3002",
    bounds: ["\u672C\u5730\u4E0E GitHub \u81EA\u52A8\u53D1\u73B0", "\u53EA\u5B58 Current \u4E0E\u89C4\u5219\u6307\u9488"],
    stage: "\u8BC6\u522B \xB7 \u5BF9\u9F50 \xB7 \u4EA4\u63A5"
  },
  {
    // 产品定义 v1.2 §2.2：能力体检不再是独立页面，并入智能体群的“能力体检”分区。
    // 保留注册项只为旧链接 #health 与站内搜索能落到该分区（mergedInto + anchor），侧栏不显示。
    id: "health",
    group: "\u76EE\u6807",
    navHidden: true,
    mergedInto: "agents",
    anchor: "agent-health",
    code: "03",
    label: "\u80FD\u529B\u4F53\u68C0",
    title: "\u80FD\u529B\u4F53\u68C0",
    eyebrow: "HEALTH CHECK",
    maturity: "partial",
    lead: "\u68C0\u67E5\u5404 Agent \u7684 Skill \u94FE\u63A5\u3001\u6302\u8F7D\u4E0E\u526F\u672C\u3002",
    bounds: ["\u95EE\u9898\u8FDB\u5165\u5F85\u5904\u7406", "!\u4FEE\u590D\u9700\u4F60\u786E\u8BA4"],
    stage: "\u68C0\u67E5 \xB7 \u62A5\u544A \xB7 \u4FEE\u590D",
    plan: {
      will: [
        "\u53EA\u8BFB\u68C0\u67E5\uFF1ASkill \u94FE\u63A5\u662F\u5426\u5931\u6548\u3001\u6302\u8F7D\u4E0E\u53D1\u5E03\u8BB0\u5F55\u662F\u5426\u4E00\u81F4\u3001\u526F\u672C\u662F\u5426\u843D\u540E\u3001Agent \u914D\u7F6E\u662F\u5426\u53EF\u8BFB\u3001Hermes gateway \u662F\u5426\u5728\u7EBF\u3002",
        "\u7ED3\u679C\u8FDB\u5165\u5F85\u5904\u7406\uFF0C\u9644\u5EFA\u8BAE\u52A8\u4F5C\u3001\u5F71\u54CD\u548C\u6062\u590D\u65B9\u6CD5\uFF1B\u4FEE\u590D\u9700\u8981\u4F60\u786E\u8BA4\u540E\u6267\u884C\uFF0C\u5E76\u590D\u9A8C\u3002",
        "\u9996\u6279\u4FEE\u590D\u53EA\u505A\u4E24\u7C7B\u4F4E\u98CE\u9669\u52A8\u4F5C\uFF1A\u6E05\u7406\u5931\u6548\u94FE\u63A5\u3001\u6309\u53D1\u5E03\u8BB0\u5F55\u91CD\u5EFA\u6302\u8F7D\u3002"
      ],
      route: "\u8DEF\u7EBF 2.2\uFF08\u53EA\u8BFB\u4F53\u68C0\uFF09\xB7 4.3\uFF08\u4FEE\u590D\uFF09",
      needs: "\u4FEE\u590D\u5C5E\u4E8E\u771F\u5B9E\u7CFB\u7EDF\u5199\u5165\uFF0C\u9700\u8981\u4F60\u5355\u72EC\u6388\u6743\u3002"
    }
  },
  {
    id: "collab",
    group: "\u8FD0\u884C",
    code: "05",
    label: "\u534F\u540C",
    title: "\u534F\u540C",
    eyebrow: "DATA LINK",
    maturity: "partial",
    lead: "\u4E24\u53F0\u66B4\u9F99\u673A\u5BF9\u63A5\uFF1A\u5DE6\u8FB9\u6301\u7B14\u8005\uFF0C\u53F3\u8FB9\u4E0B\u4E00\u68D2\u3002",
    bounds: ["!\u53E3\u4EE4\u7ECF\u4F60\u786E\u8BA4\u540E\u590D\u5236"],
    stage: "\u770B\u677F \xB7 \u6D3E\u53D1",
    plan: {
      will: [
        "\u5DF2\u53EF\u7528\uFF1A\u770B\u677F\u6309\u9879\u76EE CURRENT.md \u63A8\u65AD\u6A21\u677F #1 \u9636\u6BB5\u4E0E\u6301\u7B14\u8005\uFF0C\u64CD\u4F5C\u7559\u75D5\u5217\u51FA\u72B6\u6001\u94FE\u3001\u4EA4\u63A5\u6587\u6863\u4E0E\u590D\u5236\u8BB0\u5F55\uFF0C\u4E00\u952E\u6D3E\u53D1\u751F\u6210\u4E0B\u4E00\u68D2\u53E3\u4EE4\u3002",
        "\u53EF\u9A8C\u8BC1\u4EFB\u52A1\u81EA\u52A8\u6D3E\u53D1\uFF1A\u56DE\u5F52\u3001\u7A33\u5B9A\u6027\u77E9\u9635\u3001\u72EC\u7ACB\u590D\u6838\u6D3E\u5230\u4E91\u7AEF\u6216\u540E\u53F0\uFF0C\u7ED3\u679C\u4EE5\u5206\u652F\u6216\u62A5\u544A\u56DE\u6536\u8FDB\u5F85\u5904\u7406\u3002",
        "\u6267\u884C + \u76D1\u5DE5\uFF1ACodex \u6267\u884C\u3001Hermes \u5728\u540E\u53F0\u5BA1\u67E5\u9636\u6BB5\u4E0E\u5B8C\u6210\u58F0\u660E\uFF08\u5148\u5728\u4E00\u4E2A\u771F\u5B9E\u9879\u76EE\u4E0A\u8DD1\u901A\u8BD5\u70B9\uFF09\u3002"
      ],
      route: "\u8DEF\u7EBF 2.3\uFF08\u770B\u677F\u4E0E\u7559\u75D5\uFF09\xB7 2.4\uFF08\u4E00\u952E\u6D3E\u53D1\uFF09\u5DF2\u5F00\u53D1 \xB7 2.5\uFF08\u53EF\u9A8C\u8BC1\u4EFB\u52A1\u6D3E\u5F80\u4E91\u7AEF\uFF09\xB7 \u6A21\u677F #2 \u5F85\u8BD5\u70B9",
      needs: "\u76D1\u5DE5\u8BD5\u70B9\u9700\u8981\u4F60\u6307\u5B9A\u4E00\u4E2A\u771F\u5B9E\u9879\u76EE\uFF1B\u81EA\u52A8\u901A\u77E5\u9700\u8981\u9010\u9879\u5B9E\u6D4B\u6D88\u606F\u901A\u9053\u3002"
    }
  },
  {
    id: "night",
    group: "\u8FD0\u884C",
    code: "06",
    label: "\u591C\u5DE1",
    title: "\u591C\u5DE1",
    eyebrow: "NIGHT SHIFT",
    maturity: "planned",
    lead: "\u767B\u8BB0\u3001\u9884\u89C8\u5E76\u6279\u51C6\u591C\u5DE1\u4EFB\u52A1\uFF0C\u5728\u6307\u5B9A\u7A97\u53E3\u63A5\u529B\u3002",
    bounds: ["\u9ED8\u8BA4\u5173\u95ED", "!\u6388\u6743\u540E\u670D\u52A1\u53EF\u5728\u6307\u5B9A\u7A97\u53E3\u81EA\u52A8\u6267\u884C", "\u4EBA\u6C11\u5E01\u8349\u7A3F\u4E0E USD \u8BA1\u5212\u5206\u5F00"],
    stage: "\u89C4\u5212"
  },
  {
    id: "knowledge",
    group: "\u77E5\u8BC6",
    code: "07",
    label: "\u77E5\u8BC6\u4ED3\u5E93",
    title: "\u77E5\u8BC6\u4ED3\u5E93",
    eyebrow: "KNOWLEDGE",
    maturity: "partial",
    lead: "\u8FDE\u63A5 Obsidian\uFF0C\u6309\u539F\u6587\u67E5\u8BE2\uFF0C\u4EA4\u7ED9 Codex \u6574\u7406\u3002",
    bounds: ["\u53EA\u8BFB", "!\u5019\u9009\u7ECF\u786E\u8BA4\u624D\u843D\u5230\u201C00 \u5F85\u6574\u7406\u201D"],
    stage: "\u8FDE\u63A5 \xB7 \u67E5\u8BE2 \xB7 \u6574\u7406 \xB7 \u7EF4\u62A4"
  },
  {
    // 路线 v3 切片 5.2：周视图 + 今天、拖出规划块写入“工作台”日历、todo 读写“工作台”提醒事项；
    // 依赖本机小助手（EventKit），非 macOS 或未授权时页面如实显示，标“部分可用”。
    id: "calendar",
    group: "\u751F\u6D3B",
    code: "08",
    label: "\u65E5\u5386",
    title: "\u65E5\u5386",
    eyebrow: "CALENDAR",
    maturity: "partial",
    lead: "\u4F60\u7684\u65F6\u95F4\u89C4\u5212\u672C\uFF1A\u5728\u65F6\u95F4\u8F74\u4E0A\u62D6\u51FA\u89C4\u5212\u5757\u5199\u4E00\u53E5\u8BDD\uFF0C\u65C1\u8FB9\u662F\u9632\u6B62\u9057\u5FD8\u7684 todo\u3002\u6570\u636E\u5728 macOS \u65E5\u5386\u4E0E\u63D0\u9192\u4E8B\u9879\uFF0C\u624B\u673A\u4E5F\u80FD\u6536\u5230\u63D0\u9192\u3002",
    stage: "\u89C4\u5212 \xB7 \u5B89\u6392"
  },
  {
    id: "notes",
    group: "\u751F\u6D3B",
    code: "09",
    label: "\u968F\u624B\u8BB0",
    title: "\u968F\u624B\u8BB0",
    eyebrow: "QUICK NOTES",
    maturity: "ready",
    lead: "\u5148\u628A\u5FF5\u5934\u8BB0\u4E0B\u6765\uFF1B\u503C\u5F97\u53CD\u590D\u7528\u7684\uFF0C\u70BC\u5165\u711A\u51B3\u3002",
    bounds: ["\u53EA\u5B58\u672C\u673A", "!\u5199\u5165 Obsidian \u9700\u6388\u6743\u5E76\u9884\u89C8"],
    stage: "\u6355\u6349"
  },
  {
    // 路线 v3 切片 5.3：公开只读接口 + 本机缓存。接口字段映射尚未在本机对真实接口实测，标“部分可用”。
    id: "aihot",
    group: "\u751F\u6D3B",
    code: "10",
    label: "AI HOT",
    title: "AI HOT",
    eyebrow: "AI HOT \xB7 DAILY",
    maturity: "partial",
    lead: "\u6BCF\u65E5 AI \u8D44\u8BAF\uFF1A\u7CBE\u9009\u3001\u70ED\u70B9\u3001\u65E5\u62A5\uFF0C\u503C\u5F97\u5B66\u7684\u6536\u8FDB\u5B66\u4E60\u6210\u957F\u3002",
    bounds: ["aihot.news \u516C\u5F00\u63A5\u53E3", "\u7F13\u5B58\u5728\u672C\u673A"],
    stage: "\u6D4F\u89C8 \xB7 \u6536\u85CF"
  },
  {
    // 路线 v3 切片 5.4：书架只读索引、学习状态、链接收藏；内容解析以后再做，标“部分可用”。
    id: "learning",
    group: "\u751F\u6D3B",
    code: "11",
    label: "\u5B66\u4E60\u6210\u957F",
    title: "\u5B66\u4E60\u6210\u957F",
    eyebrow: "LEARNING",
    maturity: "partial",
    lead: "\u7535\u5B50\u4E66\u548C\u94FE\u63A5\u96C6\u4E2D\u5728\u4E00\u5904\uFF0C\u8BB0\u4E0B\u60F3\u5B66\u3001\u5728\u5B66\u3001\u5B66\u5B8C\u3002",
    bounds: ["\u539F\u4EF6\u7559\u5728\u539F\u5904", "\u53EA\u5EFA\u7D22\u5F15"],
    stage: "\u7D22\u5F15 \xB7 \u5B66\u4E60"
  },
  {
    id: "silver",
    group: "\u751F\u6D3B",
    code: "12",
    label: "\u94F6\u9970\u8BA1\u5212",
    title: "\u94F6\u9970\u8BA1\u5212",
    eyebrow: "SILVER",
    // 路线 v3 5.5（云端提前开发）：欣赏墙、收藏格、白色描边剪影；自动抠图只在 macOS 上可用，需本机验证。
    // 用户 2026-10-03：视觉待改版，先标“部分可用”。
    maturity: "partial",
    lead: "\u94F6\u9970\u7684\u6B23\u8D4F\u5899\u548C\u4E2A\u4EBA\u6536\u85CF\u683C\uFF0C\u53EA\u7ED9\u81EA\u5DF1\u770B\u3002",
    bounds: ["\u56FE\u7247\u53EA\u5B58\u672C\u673A", "\u4E0D\u8FDB\u5907\u4EFD\uFF0C\u4E5F\u4E0D\u4E0A\u4F20"],
    stage: "\u6B23\u8D4F \xB7 \u6536\u85CF"
  },
  {
    id: "settings",
    group: "\u7CFB\u7EDF",
    code: "13",
    label: "\u8BBE\u7F6E",
    title: "\u8BBE\u7F6E",
    eyebrow: "SETTINGS",
    maturity: "partial",
    lead: "\u672C\u5730\u6570\u636E\u3001\u5907\u4EFD\u4E0E\u5408\u5E76\uFF0C\u7F51\u7EDC\u8BBF\u95EE\u4E0E\u4E66\u67B6\u6587\u4EF6\u5939\u3002",
    bounds: ["\u6A21\u578B\u8FDE\u63A5\u9ED8\u8BA4\u5173\u95ED", "!\u6388\u6743\u540E\u5148\u9884\u89C8\u518D\u786E\u8BA4\u8BF7\u6C42"],
    stage: "\u6570\u636E \xB7 \u6A21\u578B"
  },
  {
    // 产品定义 v1.2 §2.2：版本归档下移到系统分组最下方；单个资产的版本在资产详情的“历史”标签里查看。
    id: "history",
    group: "\u7CFB\u7EDF",
    code: "14",
    label: "\u7248\u672C\u5F52\u6863",
    title: "\u7248\u672C\u5F52\u6863",
    eyebrow: "VERSIONS & ARCHIVE",
    maturity: "ready",
    lead: "\u6BCF\u6B21\u4FEE\u6539\u90FD\u662F\u4E00\u4E2A\u65B0\u7248\u672C\uFF0C\u6062\u590D\u65E7\u7248\u540C\u6837\u662F\u8FFD\u52A0\u3002",
    bounds: ["\u5386\u53F2\u4E0D\u4F1A\u88AB\u6539\u5199"],
    stage: "\u8FFD\u6EAF \xB7 \u6062\u590D"
  }
];
var page = (id) => PAGES.find((p) => p.id === id);

// src/components.jsx
import { Fragment as Fragment2, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var MARKS = {
  home: "mark_crest",
  assets: "mark_egg",
  agents: "mark_agent",
  projects: "mark_folder",
  knowledge: "mark_book",
  notes: "mark_pencil",
  history: "mark_branch",
  references: "mark_scan",
  night: "mark_moon",
  settings: "mark_gear"
};
function TypeIcon({ type, size = 24, className = "" }) {
  if (type === "Rule")
    return /* @__PURE__ */ jsx4(
      Pixel,
      {
        sprite: "rule_scroll",
        fit: size,
        className: `type-icon-pixel ${className}`
      }
    );
  const Icon = type === "Skill" ? Layers : type === "Prompt" ? Quote : type === "Scroll" ? Flame : Workflow;
  return /* @__PURE__ */ jsx4(Icon, { size, className: className || void 0 });
}
function Bounds({ items }) {
  return /* @__PURE__ */ jsx4("ul", { className: "page-bounds", "aria-label": "\u8FB9\u754C", children: items.map((item) => (
    // 以“!”开头的是需要授权的门禁，用灰色标记。
    /* @__PURE__ */ jsx4("li", { className: item.startsWith("!") ? "gate" : "", children: item.replace(/^!/, "") }, item)
  )) });
}
function Maturity({ level }) {
  if (!level) return null;
  return /* @__PURE__ */ jsxs4("span", { className: `maturity ${level}`, children: [
    /* @__PURE__ */ jsx4("i", { "aria-hidden": "true" }),
    MATURITY[level]
  ] });
}
function PageHeading({ page: page2, eyebrow, title, description, action, titleHidden = false, help }) {
  const meta = page2 ? page(page2) : null;
  return /* @__PURE__ */ jsxs4(Fragment2, { children: [
    /* @__PURE__ */ jsxs4("header", { className: "page-heading", children: [
      page2 && MARKS[page2] && /* @__PURE__ */ jsx4(Pixel, { sprite: MARKS[page2], size: 210, className: "page-mark", dots: true }),
      /* @__PURE__ */ jsxs4("div", { className: "page-heading-main", children: [
        /* @__PURE__ */ jsxs4("div", { className: "page-eyebrow", children: [
          meta && /* @__PURE__ */ jsx4("span", { className: "page-code", children: meta.code }),
          page2 === "silver" ? /* @__PURE__ */ jsx4("span", { children: eyebrow || meta?.eyebrow }) : /* @__PURE__ */ jsx4(LcdText, { text: eyebrow || meta?.eyebrow, px: 2, boot: true }),
          meta?.maturity && /* @__PURE__ */ jsx4(Maturity, { level: meta.maturity })
        ] }),
        help ? /* @__PURE__ */ jsxs4("div", { className: "title-row", children: [
          /* @__PURE__ */ jsx4("h1", { className: titleHidden ? "sr-only" : void 0, children: title || meta?.title }),
          help
        ] }) : /* @__PURE__ */ jsx4("h1", { className: titleHidden ? "sr-only" : void 0, children: title || meta?.title }),
        (description || meta?.lead) && /* @__PURE__ */ jsx4("p", { className: "page-lead", children: description || meta.lead })
      ] }),
      action && /* @__PURE__ */ jsx4("div", { className: "page-heading-action", children: action })
    ] }),
    !description && meta?.bounds && /* @__PURE__ */ jsx4(Bounds, { items: meta.bounds })
  ] });
}

// docs/design/ui-v16/build/kit-entry.jsx
import * as L from "lucide-react";
var h = React5.createElement;
var r = {
  lcd: (text, px = 2) => R(h(LcdText, { text: String(text), px })),
  pixel: (sprite, size = 48) => R(h(Pixel, { sprite, size })),
  digivice: (size = 240, sprite = "egg") => R(h(DigiviceArt, { size }, h(Pixel, { sprite, size: Math.round(size * 0.3) }))),
  heading: (page2, over = {}) => R(h(PageHeading, { page: page2, ...over })),
  maturity: (level) => R(h(Maturity, { level })),
  type: (type, size = 16) => R(h(TypeIcon, { type, size })),
  corners: () => R(h(Corners)),
  ic: (name, size = 16) => L[name] ? R(h(L[name], { size, strokeWidth: 1.8, "aria-hidden": true })) : ""
};
export {
  r
};
