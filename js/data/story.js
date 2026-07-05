// story.js — NSD.STORY: フェーズ進行・アラート・チャット・証跡・法メモ・小ネタ・エンディング文面
// 「アオイ先輩」=リモート待機の頼れる先輩1名のみ登場。文章の質が没入を決める。
(() => {
  'use strict';

  const STORY = {

    // =====================================================================
    // フェーズ(6): quiet → ripple → storm → silent → line → dawn
    // 各フェーズに intro チャット / objectives / suggests / alerts / unlocks / grants
    // =====================================================================
    phases: [

      // --- 00:00 静かな夜 : 道具開き(チュートリアル) --------------------
      {
        id: 'quiet', clock: '00:00', clockMin: 0,
        title: '静かな夜', subtitle: '道具開き',
        weeks: [1, 2, 3, 4, 5, 6],
        intro: [
          { from: 'アオイ先輩', text: '来たね。今夜からあなたが当番。私はリモートで待機してるから、困ったら投げて。' },
          { from: 'アオイ先輩', text: 'ここSOCは24時間365日、この会社のネットワークを見張る監視室。まずは道具に慣れよう。凡人は道具を選べ、ってやつ。ちゃんと選んで、ちゃんと使えば怖くない。' },
          { from: 'アオイ先輩', text: '中央がターミナル。whois、ping、traceroute、curl。前半で叩いたコマンドが、そのまま調査の道具になる。まずは自社Webの死活確認から。ping aoba-web、打ってみて。' }
        ],
        objectives: [
          { id: 'try-ping', text: '自社Web(aoba-web)の死活を ping で確認する',
            hint: 'ping aoba-web',
            doneOn: { event: 'term:executed', match: { cmd: 'ping' } } },
          { id: 'try-whois', text: '自社Webの登録情報を whois で引いてみる',
            hint: 'whois 198.51.100.20',
            doneOn: { event: 'term:executed', match: { cmd: 'whois' } } },
          { id: 'try-nat', text: 'show nat-table でNAPTセッション表を眺める',
            hint: 'show nat-table',
            doneOn: { event: 'term:executed', match: { cmd: 'show', sub: 'nat-table' } } }
        ],
        suggests: [
          { label: 'ping aoba-web', cmd: 'ping aoba-web' },
          { label: 'whois 198.51.100.20', cmd: 'whois 198.51.100.20' },
          { label: 'show nat-table', cmd: 'show nat-table' },
          { label: 'show devices', cmd: 'show devices' },
          { label: 'traceroute aoba-web', cmd: 'traceroute aoba-web' }
        ],
        alerts: ['al-tutorial'],
        unlocks: ['soc', 'siem', 'edr', 'waf', 'ipv4', 'network-host', 'rfc1918',
          'whois', 'iana-apnic', 'rir', 'ping', 'traceroute', 'ttl', 'icmp-time-exceeded',
          'nat', 'napt', 'nat-pool', 'curl-ifconfig'],
        grants: { knowledge: [], evidence: [] }
      },

      // --- 01:00 最初のさざなみ : IoT / Mirai 初期侵入 --------------------
      {
        id: 'ripple', clock: '01:00', clockMin: 60,
        title: '最初のさざなみ', subtitle: 'IoT/Miraiの初期侵入',
        weeks: [9],
        intro: [
          { from: 'アオイ先輩', text: '静かだったのに、NDRセンサーが1件上げてきた。外から社内の機器に、23番ポート宛の妙な応答がある。' },
          { from: 'アオイ先輩', text: '23番はTelnet。今どき外に開けてたら、まず狙われる。どの機器が喋ってるのか、show devices で棚卸しして、怪しいのを inspect してみて。' }
        ],
        objectives: [
          { id: 'list-devices', text: '社内機器を show devices で棚卸しする',
            hint: 'show devices',
            doneOn: { event: 'term:executed', match: { cmd: 'show', sub: 'devices' } } },
          { id: 'whois-scan', text: 'スキャン元IP 203.0.113.66 を whois で特定する',
            hint: 'whois 203.0.113.66',
            doneOn: { event: 'term:executed', match: { cmd: 'whois', arg: '203.0.113.66' } } },
          { id: 'inspect-mfp', text: '複合機(mfp-3f)を inspect して感染の痕跡を掴む',
            hint: 'inspect mfp-3f',
            doneOn: { event: 'evidence:add', match: 'ev-iot' } }
        ],
        suggests: [
          { label: 'show devices', cmd: 'show devices' },
          { label: 'whois 203.0.113.66', cmd: 'whois 203.0.113.66' },
          { label: 'inspect mfp-3f', cmd: 'inspect mfp-3f' },
          { label: 'show logs mfp-3f', cmd: 'show logs mfp-3f' }
        ],
        alerts: ['al-iot-scan'],
        unlocks: ['mirai', 'botnet', 'mirai-dict', 'notice', 'pl-law', 'brick', 'backdoor'],
        grants: {
          knowledge: ['soc', 'whois', 'ping', 'nat', 'napt'],
          evidence: []
        }
      },

      // --- 02:30 嵐が来る : DDoS(処理能力超過) -------------------------
      {
        id: 'storm', clock: '02:30', clockMin: 150,
        title: '嵐が来る', subtitle: 'DDoS(処理能力超過)',
        weeks: [5, 6, 10],
        game: 'ddos',
        intro: [
          { from: 'アオイ先輩', text: '来た。自社サイトへの流量が跳ねてる。さっきの複合機が仲間だとしたら、これはボットネットからのDDoSだ。' },
          { from: 'アオイ先輩', text: 'DDoSって特別な魔法じゃない。「処理能力を超える要求」を投げつけてるだけ。輻輳と同じ構造。まずは自社Webにpingして、応答が返るか、どれだけ苦しいか見て。それから対応タブへ。' }
        ],
        objectives: [
          { id: 'ping-underfire', text: '攻撃下の自社Web(aoba-web)に ping して負荷を体感する',
            hint: 'ping aoba-web',
            doneOn: { event: 'term:executed', match: { cmd: 'ping', arg: 'aoba-web' } } },
          { id: 'see-nat-storm', text: 'show nat-table でセッションの逼迫を確認する',
            hint: 'show nat-table',
            doneOn: { event: 'term:executed', match: { cmd: 'show', sub: 'nat-table' } } }
        ],
        suggests: [
          { label: 'ping aoba-web', cmd: 'ping aoba-web' },
          { label: 'show nat-table', cmd: 'show nat-table' },
          { label: 'curl aoba-web', cmd: 'curl aoba-web' }
        ],
        alerts: ['al-ddos'],
        unlocks: ['ddos', 'dos-universal', 'congestion', 'throughput', 'bandwidth',
          'tcp-cc', 'retry-storm', 'slashdot-effect', 'tashiro-cannon'],
        grants: {
          knowledge: ['soc', 'whois', 'ping', 'nat', 'napt', 'mirai', 'botnet', 'notice'],
          evidence: ['ev-iot']
        }
      },

      // --- 03:30 静かすぎる : Web改ざん & 脆弱性(調査の山場) -----------
      {
        id: 'silent', clock: '03:30', clockMin: 210,
        title: '静かすぎる', subtitle: 'Web改ざんとハッシュ照合',
        weeks: [11],
        game: 'hash',
        intro: [
          { from: 'アオイ先輩', text: '嵐が引いた。……でも、静かすぎる。DDoSって陽動だったのかもしれない。あれで人手を取られてる間に、本命が動くのが定石。' },
          { from: 'アオイ先輩', text: '自社Webのトップを curl で見て。それと、公開中のJSファイルのハッシュを基準値と照合する。1文字でも書き換わってれば、ハッシュは全く別物になる。改ざんファイルを炙り出そう。' }
        ],
        objectives: [
          { id: 'curl-web', text: 'curl aoba-web で改ざんの兆候を確認する',
            hint: 'curl aoba-web',
            doneOn: { event: 'term:executed', match: { cmd: 'curl', arg: 'aoba-web' } } },
          { id: 'find-tampered', text: 'ハッシュ照合で改ざんされたファイルを特定する',
            hint: '対応タブのハッシュ照合を進める',
            doneOn: { event: 'evidence:add', match: 'ev-deface' } }
        ],
        suggests: [
          { label: 'curl aoba-web', cmd: 'curl aoba-web' },
          { label: 'hash /var/www/js/mainte.js', cmd: 'hash /var/www/js/mainte.js' },
          { label: 'show logs web-dmz', cmd: 'show logs web-dmz' }
        ],
        alerts: ['al-deface'],
        unlocks: ['cve-cvss', 'reverse-proxy', 'virustotal', 'strace-tcpdump',
          'ipa-top10', 'defense-in-depth'],
        grants: {
          knowledge: ['soc', 'whois', 'ping', 'curl-ifconfig', 'nat', 'napt',
            'mirai', 'botnet', 'ddos', 'dos-universal', 'retry-storm'],
          evidence: ['ev-iot', 'ev-ddos']
        }
      },

      // --- 05:00 一本の線 : AiTM / キルチェーン統合(クライマックス) ----
      {
        id: 'line', clock: '05:00', clockMin: 300,
        title: '一本の線', subtitle: 'AiTMとキルチェーン統合',
        weeks: [12, 13],
        game: 'killchain',
        intro: [
          { from: 'アオイ先輩', text: '改ざんファイルの中に、外へ喋る一行が埋まってた。バックドアだ。宛先を traceroute で追って。遠い。海外のC2サーバーだと思う。' },
          { from: 'アオイ先輩', text: 'それと、経理あてに来てた「多要素認証の再設定」メール。あれ、AiTMのフィッシングだと思う。OTPごと中継で盗まれる。show mail で確かめて。……点が、線になりそう。' }
        ],
        objectives: [
          { id: 'trace-c2', text: 'C2サーバー(c2.nightowl.example)への経路を traceroute で追う',
            hint: 'traceroute c2.nightowl.example',
            doneOn: { event: 'term:executed', match: { cmd: 'traceroute' } } },
          { id: 'read-mail', text: 'show mail でAiTMフィッシングメールを確認する',
            hint: 'show mail',
            doneOn: { event: 'term:executed', match: { cmd: 'show', sub: 'mail' } } },
          { id: 'find-exfil', text: '窃取された認証による情報持ち出しの証跡を掴む',
            hint: 'メールの偽ログインサイトを curl で確認する',
            doneOn: { event: 'evidence:add', match: 'ev-exfil' } }
        ],
        suggests: [
          { label: 'traceroute c2.nightowl.example', cmd: 'traceroute c2.nightowl.example' },
          { label: 'whois 198.51.100.7', cmd: 'whois 198.51.100.7' },
          { label: 'show mail', cmd: 'show mail' },
          { label: 'curl 203.0.113.80', cmd: 'curl 203.0.113.80' }
        ],
        alerts: ['al-aitm'],
        unlocks: ['aitm', 'kill-chain', 'apt', 'mandiant', 'gtg-1002',
          'prompt-injection', 'ransomware', 'wayback', 'asymmetric-routing',
          'tier1-isp', 'sinet'],
        grants: {
          knowledge: ['soc', 'whois', 'ping', 'traceroute', 'curl-ifconfig',
            'nat', 'napt', 'mirai', 'botnet', 'ddos', 'dos-universal',
            'cve-cvss', 'reverse-proxy', 'virustotal', 'backdoor'],
          evidence: ['ev-iot', 'ev-ddos', 'ev-deface']
        }
      },

      // --- 06:00 朝が来る : 引き継ぎレポート & 振り返り -----------------
      {
        id: 'dawn', clock: '06:00', clockMin: 360,
        title: '朝が来る', subtitle: '引き継ぎと振り返り',
        weeks: [],
        report: true,
        intro: [
          { from: 'アオイ先輩', text: '夜が明けた。よく乗り切ったね。あとは日勤チームへの引き継ぎ。あなたが今夜やったことが、そのままレポートになる。' },
          { from: 'アオイ先輩', text: '一晩お疲れさま。……気づいた? あなたは今夜、13週分の学びを全部使ったんだよ。' }
        ],
        objectives: [],
        suggests: [],
        alerts: [],
        unlocks: ['ipa-top10', 'y2036', 'iown', 'quantum-comm', 'splinternet'],
        grants: {
          knowledge: ['soc', 'siem', 'edr', 'waf', 'whois', 'ping', 'traceroute',
            'curl-ifconfig', 'nat', 'napt', 'ttl', 'mirai', 'botnet', 'notice',
            'pl-law', 'ddos', 'dos-universal', 'retry-storm', 'cve-cvss',
            'reverse-proxy', 'virustotal', 'backdoor', 'aitm', 'kill-chain',
            'defense-in-depth', 'apt', 'mandiant'],
          evidence: ['ev-iot', 'ev-ddos', 'ev-deface', 'ev-exfil']
        }
      }
    ],

    // =====================================================================
    // アラート(5件): al-tutorial / al-iot-scan / al-ddos / al-deface / al-aitm
    // steps.cmd は §6コマンド + world/§12に実在するもののみ
    // =====================================================================
    alerts: {

      'al-tutorial': {
        phase: 'quiet', time: '00:04', sev: 'info',
        title: '【訓練】シフト開始チェック', source: '当直手順',
        body: '本日の当番として、監視卓の道具が使えることを確認します。これは訓練アラートです。落ち着いて、ひとつずつコマンドに触れてください。焦らなくていい。夜は長い。',
        steps: [
          { text: '自社Webの死活を ping で確認', cmd: 'ping aoba-web' },
          { text: '自社Webの登録情報を whois で照会', cmd: 'whois 198.51.100.20' },
          { text: 'NAPTセッション表を表示', cmd: 'show nat-table' }
        ],
        reveals: ['soc', 'ping', 'whois', 'napt'],
        evidence: []
      },

      'al-iot-scan': {
        phase: 'ripple', time: '01:38', sev: 'warn',
        title: '外部から23/tcpへのスキャン応答を検知', source: 'NDRセンサー',
        body: '外部IP 203.0.113.66 から社内セグメントへ、Telnet(23/tcp)を狙う接続試行。うち1台が応答を返しています。Miraiに代表されるIoTボットは、工場出荷時のID/パスワードを辞書で総当たりして機器を乗っ取ります。応答した機器を特定し、認証ログを確認してください。',
        steps: [
          { text: '社内機器を棚卸し', cmd: 'show devices' },
          { text: 'スキャン元IPの登録組織を照会', cmd: 'whois 203.0.113.66' },
          { text: '応答した複合機を精査', cmd: 'inspect mfp-3f' },
          { text: '複合機の認証ログを確認', cmd: 'show logs mfp-3f' }
        ],
        reveals: ['mirai', 'mirai-dict', 'botnet', 'notice', 'pl-law'],
        evidence: ['ev-iot']
      },

      'al-ddos': {
        phase: 'storm', time: '02:34', sev: 'crit',
        title: '自社Webへの異常トラフィック急増', source: 'WAF / フロー監視',
        body: '自社Web(198.51.100.20)向けのリクエストが平常の数十倍に急増。多数の送信元から一斉に押し寄せており、分散型サービス妨害(DDoS)の様相です。NAPTセッションが上限(約65,536)に迫っています。対応タブで緩和策を投入してください。ただし「全クライアントに即時リトライ」は厳禁——それはリトライストームを招きます。',
        steps: [
          { text: '攻撃下の自社Webに ping して応答遅延を体感', cmd: 'ping aoba-web' },
          { text: 'セッション逼迫をNAPT表で確認', cmd: 'show nat-table' },
          { text: '対応タブでDDoS緩和を実施', cmd: '' }
        ],
        reveals: ['ddos', 'dos-universal', 'retry-storm', 'tcp-cc', 'congestion'],
        evidence: ['ev-ddos']
      },

      'al-deface': {
        phase: 'silent', time: '03:52', sev: 'warn',
        title: '自社Webトップに未登録スクリプトの混入疑い', source: '改ざん検知 / リバースプロキシログ',
        body: 'DMZの自社Webサーバー(web-dmz)で、配信中のトップページに見慣れない外部スクリプト参照が確認されました。DDoSの陰で本命が動いた可能性。公開JSファイル群のハッシュを既知の正規値と照合し、書き換えられた1件を特定してください。ハッシュは1バイトの改変でも全く別の値になります。',
        steps: [
          { text: '自社Webトップを取得して確認', cmd: 'curl aoba-web' },
          { text: 'リバースプロキシのアクセスログを確認', cmd: 'show logs web-dmz' },
          { text: '疑わしいファイルのハッシュを照合', cmd: 'hash /var/www/js/mainte.js' }
        ],
        reveals: ['cve-cvss', 'reverse-proxy', 'virustotal', 'backdoor', 'ipa-top10'],
        evidence: ['ev-deface']
      },

      'al-aitm': {
        phase: 'line', time: '05:06', sev: 'crit',
        title: '経理宛フィッシングと外部C2への発信を検知', source: '相関分析 / メールゲートウェイ',
        body: '改ざんファイルに埋め込まれたバックドアが、海外のC2サーバー(198.51.100.7 / c2.nightowl.example)へ発信しています。並行して、経理担当宛に「多要素認証の再設定」を騙るメールを検知。これはAiTM(中間者)フィッシングで、ワンタイムパスワードごとリアルタイムに中継窃取されます。ここまでの証跡を突き合わせ、一本の攻撃ストーリーとして相関分析してください。',
        steps: [
          { text: 'C2への経路を追跡', cmd: 'traceroute c2.nightowl.example' },
          { text: 'C2の登録情報を照会', cmd: 'whois 198.51.100.7' },
          { text: 'フィッシングメールを確認', cmd: 'show mail' },
          { text: '偽ログインサイトを確認', cmd: 'curl 203.0.113.80' }
        ],
        reveals: ['aitm', 'kill-chain', 'defense-in-depth', 'apt', 'mandiant', 'gtg-1002'],
        evidence: ['ev-exfil']
      }
    },

    // =====================================================================
    // チャット: 進行イベントに反応する先輩の合いの手(15件+)
    // evidence 発見時の解説が学びの中核。course_map の知識を会話で自然に教える。
    // on は §4 のイベント名、match は該当ペイロードの主キー(id等)。
    // =====================================================================
    chats: [

      // -- フェーズ入場の合いの手 --
      { phase: 'ripple', on: 'phase:enter', match: 'ripple', from: 'アオイ先輩',
        text: 'さざなみが立った。まだ小さい。でも夜のインシデントは、たいてい小さな1件から始まるんだよ。' },
      { phase: 'storm', on: 'phase:enter', match: 'storm', from: 'アオイ先輩',
        text: '波が高くなってきた。落ち着いて。グラフを見て、原因より先にまず流量を落とす。消火が先、原因究明は後。' },
      { phase: 'silent', on: 'phase:enter', match: 'silent', from: 'アオイ先輩',
        text: '嵐のあとの静けさって、気持ち悪いでしょ。この「静かすぎる」が一番危ない時間帯。手を止めないで。' },
      { phase: 'line', on: 'phase:enter', match: 'line', from: 'アオイ先輩',
        text: 'ここまで来たね。バラバラに見えた事件が、たぶん全部つながってる。あなたの手で、線を引いて。' },

      // -- コマンド実行への合いの手 --
      { phase: 'quiet', on: 'term:executed', match: { cmd: 'traceroute' }, from: 'アオイ先輩',
        text: 'traceroute、いいね。TTLを1ずつ増やして、途中のルーターにわざとICMP Time-Exceededを吐かせる。各ホップの数字が、そのまま通信の足あと。' },
      { phase: 'quiet', on: 'term:executed', match: { cmd: 'show', sub: 'nat-table' }, from: 'アオイ先輩',
        text: 'それがNAPT。1個のグローバルIPを、ポート番号で振り分けて全社員が共有してる。ポートは16bit=約65,536。この上限、あとで効いてくるから覚えておいて。' },
      { phase: 'ripple', on: 'term:executed', match: { cmd: 'whois', arg: '203.0.113.66' }, from: 'アオイ先輩',
        text: 'whoisで登録組織が引けたね。IPは誰かに割り当てられた資産。IANA→APNIC→各国と階層で管理されてる。攻撃元の素性を掴む、調査の第一歩。' },

      // -- 証跡発見時の中核解説(course_mapの知識を会話で教える) --
      { phase: 'ripple', on: 'evidence:add', match: 'ev-iot', from: 'アオイ先輩',
        text: '認証ログ、見た? root/xc3511、admin/admin1234……これMiraiのソースコードにあるIoT機器のデフォルトパスワード辞書そのもの。複合機が工場出荷のまま外に晒されて、乗っ取られた。' },
      { phase: 'ripple', on: 'evidence:add', match: 'ev-iot', from: 'アオイ先輩',
        text: 'こういうIoTの放置機器、国の制度NOTICEがISP経由で注意喚起してるくらい社会問題なんだ。「この機器は誰の責任?」——メーカーか、設置者か。PL法の話にもつながる。あとで法メモが出るかも。' },
      { phase: 'storm', on: 'evidence:add', match: 'ev-ddos', from: 'アオイ先輩',
        text: 'やっぱりDDoSは陽動だった。処理能力を超える要求で人手を奪う——群衆事故や取り付け騒ぎと同じ「処理能力超過」の構造。KDDIの障害も、復旧61時間・3,915万回線、リトライの連鎖で自分で自分の首を絞めた。あなたはリトライの罠を踏まなかった。上出来。' },
      { phase: 'silent', on: 'evidence:add', match: 'ev-deface', from: 'アオイ先輩',
        text: 'ハッシュ1件だけ基準値と食い違ってたでしょ。それが改ざんファイル。公知の実例だと、2018年の大阪大学Webサイト改ざんでも約2,530個のJSからMD5で1件を洗い出した。膨大な干し草の山から、たった1本の針を確実に。これがフォレンジックの地道さ。' },
      { phase: 'silent', on: 'evidence:add', match: 'ev-deface', from: 'アオイ先輩',
        text: '埋め込まれてたのはバックドア——攻撃者の裏口。古いCVEが放置されてると、こじ開けられる。VirusTotalに投げれば複数エンジンで一発照合できる。正規のリバースプロキシログと突き合わせるのも定石。' },
      { phase: 'line', on: 'evidence:add', match: 'ev-exfil', from: 'アオイ先輩',
        text: 'AiTMは中間者攻撃。偽サイトが本物との間に立って、IDもパスワードもOTPも、全部リアルタイムで中継して盗む。多要素認証を入れてても、OTP単体じゃ防げない。だから多層防御——技術・ガバナンス・人の三層で守る。' },
      { phase: 'line', on: 'evidence:add', match: 'ev-exfil', from: 'アオイ先輩',
        text: '窃取した認証で堂々と入られて、情報が持ち出された。これで4枚そろった。IoT侵入→DDoS陽動→改ざん・バックドア→AiTMで持ち出し。個人の隙が組織を滅ぼし、組織の陥落が個人の財布を空にする。キルチェーンだ。' },

      // -- ゲーム/相関の合いの手 --
      { phase: 'storm', on: 'ddos:resolved', match: null, from: 'アオイ先輩',
        text: 'グラフがすっと落ちた。流入を絞って、さばく力を足す——輻輳制御と同じ発想で収めたね。レートリミットも仮想待合室も、根っこは第5・6回でやったTCPの混雑制御と地続きなんだよ。' },
      { phase: 'silent', on: 'hash:solved', match: null, from: 'アオイ先輩',
        text: '特定、お見事。ハッシュは「同じ入力なら必ず同じ、1文字違えば全く別」。だから改ざん検知に効く。人力じゃ無理な照合を、関数一発で。道具を選べ、だね。' },
      { phase: 'line', on: 'chain:done', match: null, from: 'アオイ先輩',
        text: '線が引けた。……きれいだね、こんな状況で言うのもなんだけど。バラバラの脅威に潜む一本の線。これを見抜けるのが、SOCアナリストの仕事。あとは封じ込めて、朝の引き継ぎへ。' },

      // -- 判断への合いの手 --
      { phase: 'silent', on: 'decision:made', match: 'law-secrecy', from: 'アオイ先輩',
        text: '調べたい気持ちはわかる。でも通信の秘密は憲法21条2項。範囲を決めずに全部覗くのは、越権。線を引ける人が、信頼される人。' },

      // -- 章ジャンプ時の導入補足 --
      { phase: 'storm', on: 'phase:enter', match: 'storm', from: 'アオイ先輩',
        text: '(前の当番からの引き継ぎ:複合機の感染は確認済み。今はDDoSの真っ最中。)' },
      { phase: 'line', on: 'phase:enter', match: 'line', from: 'アオイ先輩',
        text: '(引き継ぎ:IoT侵入・DDoS陽動・改ざん、ここまで判明。残るは持ち出しの裏取りと、相関分析。)' }
    ],

    // =====================================================================
    // 証跡(4件): chainStep 1〜4。killchain 演出で読まれる決定的文章。
    // =====================================================================
    evidence: [
      {
        id: 'ev-iot', time: '01:42', kind: '初期侵入', chainStep: 1,
        label: '複合機がMirai型の辞書攻撃で乗っ取られた',
        detail: '3F複合機(mfp-3f / 192.168.10.23)の認証ログに、root/xc3511・admin/admin1234といったMiraiのデフォルトパスワード辞書と一致する総当たりの痕跡。工場出荷設定のまま外部へ露出し、23/tcp経由で侵入された。これが侵入の起点。'
      },
      {
        id: 'ev-ddos', time: '02:51', kind: '陽動', chainStep: 2,
        label: 'DDoSは本命を隠すための煙幕だった',
        detail: '自社Web(198.51.100.20)への大量リクエストは、乗っ取ったIoT群からの分散攻撃。NAPTセッションを枯渇寸前まで追い込み、対応リソースを奪った。しかしこれは陽動——人手がここに集まっている隙に、本命が別の場所で動いていた。'
      },
      {
        id: 'ev-deface', time: '04:10', kind: '改ざん', chainStep: 3,
        label: '放置CVEを突かれ、Webにバックドアが設置された',
        detail: 'DMZの自社Web(web-dmz)で、公開JSファイル1件のMD5ハッシュが正規値と不一致。書き換えられたファイルには外部へ発信する一行——バックドアが埋め込まれていた。未パッチの脆弱性(CVE)が入口。VirusTotal照合とリバースプロキシログが裏付けとなった。'
      },
      {
        id: 'ev-exfil', time: '05:20', kind: '情報流出', chainStep: 4,
        label: 'AiTMで窃取した認証で、情報が持ち出された',
        detail: '経理宛の「多要素認証の再設定」フィッシング(偽ログイン 203.0.113.80)で、ID・パスワード・OTPをAiTMにより中継窃取。正規の認証情報で堂々と侵入され、バックドア経由でC2(198.51.100.7 / c2.nightowl.example)へデータが持ち出された。これが攻撃の終着点。'
      }
    ],

    // =====================================================================
    // 法メモ(3件): 調査が行き過ぎる瞬間の倫理ブレーキ。WEEK 07/09 を引用。
    // choice {a,b} と right。
    // =====================================================================
    laws: [
      {
        id: 'law-secrecy', trigger: { phase: 'silent' }, title: 'その調査、越権では?',
        week: 7,
        body: '改ざんの調査で、社内の通信ログをどこまで見るかの判断です。通信の秘密は憲法21条2項「通信の秘密は、これを侵してはならない」で保障され、電気通信事業法でも罰則付きで守られています。インシデント対応でも、覗ける範囲は無制限ではありません。(WEEK 07 合意形成ロールプレイ発表会)',
        choice: {
          a: '令状・社内規程で定められた範囲に絞って、必要なログだけを調べる',
          b: '早く犯人を捕まえたいので、全社員の私用メールも中身まで全部読む'
        },
        right: 'a'
      },
      {
        id: 'law-privacy', trigger: { phase: 'line' }, title: '被害者の私生活まで晒す?',
        week: 7,
        body: 'フィッシングに引っかかった経理担当者の個人的なやり取りが、ログに残っています。プライバシー権は明文法こそないものの、「宴のあと」裁判(1961)が①私生活上の事実②一般人の感受性で公開を欲しない③未公知④当人に不快、の4要件を示して以来、判例上確立した権利です。担当者は加害者ではなく被害者。(WEEK 07)',
        choice: {
          a: '調査に必要な範囲のみ記録し、私生活の情報は報告書から除く',
          b: '「気の緩みが原因」と、担当者の私生活まで詳細に報告書へ書く'
        },
        right: 'a'
      },
      {
        id: 'law-pl', trigger: { phase: 'ripple' }, title: 'この機器、誰の責任?',
        week: 9,
        body: '乗っ取られた複合機は、工場出荷時のパスワードのまま放置されていました。製造物の欠陥による損害はPL法が製造者の責任を問い、放置IoTには国の制度NOTICE(NICT)がISP経由で注意喚起しています。とはいえ、設置・運用側にも管理責任がある。犯人捜しより、まず封じ込めと再発防止です。(WEEK 09 Miraiに学ぶIoTセキュリティ)',
        choice: {
          a: 'まず機器を隔離して被害を止め、責任分界は事実を記録した上で後で整理する',
          b: '「メーカーが悪い」と断じて、対処は後回しにする'
        },
        right: 'a'
      }
    ],

    // =====================================================================
    // イースターエッグ(10件): §12台帳全部。course_map §7 の名場面が元ネタ。
    // トリガーは特定コマンド。テキストは (WEEK nn) 表記で出典。
    // =====================================================================
    eggs: [
      {
        id: 'egg-biwako', on: { cmd: 'block', arg: '8.8.8.8' },
        text: '「琵琶湖の水止めたろか!」……気持ちはわかるけど、それ公共のDNS(8.8.8.8)まで巻き込む無差別遮断です。比例原則を思い出して——止めるなら攻撃元だけ、必要最小限に。(WEEK 07)'
      },
      {
        id: 'egg-tashiro', on: { cmd: 'curl', arg: 'tashiro' },
        text: '田代砲、発射しようとしました? 特定サイトへ連続アクセスを自動化するアレは、由来からしてDDoSそのもの。2001年のTIME誌投票事件が元ネタです。撃つ側に回ったら、あなたが今夜の敵。(WEEK 10)'
      },
      {
        id: 'egg-fish', on: { cmd: 'help', arg: '--shell' },
        text: 'シェル雑学:Fishは「ナウなヤングはみんなこれ[要出典]」。zshもいいけど、SOCの当直卓は結局そこにある道具で戦うのが早い。凡人は道具を選べ。(WEEK 01)'
      },
      {
        id: 'egg-pen', on: { cmd: 'help', arg: '--pen' },
        text: '道具の話:第4の道具は「ペン」。HI-TEC-Cの0.3が至高、という宗派があります。ターミナル・シェル・エディタ・ペン——手を動かすための四天王。(WEEK 01)'
      },
      {
        id: 'egg-ojisan', on: { cmd: 'help', arg: '--bash' },
        text: 'Bashは「主におじさんがつかってるシェル」だそうです。でも枯れてる=堅い、でもある。当直卓では安定が正義。おじさん、悪くない。(WEEK 01)'
      },
      {
        id: 'egg-oranda', on: { cmd: 'traceroute', arg: 'oranda' },
        text: '経路がアムステルダム経由に見えた? 「経由先のカフェの名前が"オランダ屋"だからオランダに置いてる説」を大真面目に検証した先人がいます。結論:ネットワーク系は沼。(WEEK 05)'
      },
      {
        id: 'egg-pokesleep', on: { cmd: 'ping', arg: 'snorlax' },
        text: 'カビゴンにpingしようとしました? 「ポケスリは人生の大切なこと全部詰まってる」という名(迷)脱線がありました。夜勤明けはちゃんと寝る。それも立派なセキュリティ。(WEEK 09)'
      },
      {
        id: 'egg-award', on: { cmd: 'show', sub: 'awards' },
        text: 'DDoS AWARDS 発表:元祖DoS賞=PLATO事件(1974)、犯人めっちゃマヌケ賞=Mafiaboy、マッチポンプ賞=Mirai、天然DDoS賞=ゲーム内結婚式に人が殺到した件。負の栄誉。(WEEK 10)'
      },
      {
        id: 'egg-apt-mensetsu', on: { cmd: 'whois', arg: 'apt' },
        text: '就活ネタ:「好きなAPTはAPT41です」と面接で言える——やめなさい。APTは国家等の支援を受けた持続的攻撃者。現在46グループ確認。図鑑にするのは可、推し語りは面接以外で。(WEEK 13)'
      },
      {
        id: 'egg-ikkai', on: { cmd: 'show', sub: 'devices', arg: 'home' },
        text: '自宅にネットワークラック組んでます? それ「逸般の誤家庭」です。DHCPさんいわく「同じ部屋に2人は泊まれない」。家庭内の合意形成(=家族の許可)もお忘れなく。(WEEK 03)'
      }
    ],

    // =====================================================================
    // エンディング: ランク文言 / 締めの文章 / 引き継ぎテンプレ
    // 「あなたは今夜、13週分の学びを全部使った」の回収。
    // =====================================================================
    ending: {
      rankLabels: {
        S: 'S — 完全封じ込め。あなたは一晩で、検知から報告までを迷いなく走り抜けた。倫理の線も、技術の線も、一本も踏み外さなかった。日勤チームが受け取るのは、完璧な引き継ぎだ。今夜のSOCは、あなたで正解だった。',
        A: 'A — 見事な対応。攻撃の全体像を掴み、キルチェーンを断ち切った。いくつか判断に迷いはあったけれど、被害は最小限に抑え込まれた。あなたはもう、新米ではない。',
        B: 'B — 夜を越えた。取りこぼしはあったし、間に合わなかった場面もあった。それでも、あなたは椅子に座り続け、朝まで手を止めなかった。その事実が次に効く。振り返って、また入ろう。'
      },
      closing: 'これで引き継ぎは完了です。長い夜だった。静かな一件のアラートから始まり、複合機の乗っ取り、DDoSの陽動、Web改ざんとバックドア、AiTMによる情報持ち出しまで——バラバラの脅威が、あなたの手で一本の線につながった。\n\nwhoisで攻撃元を引き、pingとtracerouteで距離を測り、NAPT表でセッションの逼迫を読み、ハッシュで改ざんを暴き、キルチェーンを描き、そのたびに通信の秘密とプライバシーの線を守った。\n\nあなたは今夜、13週分の学びを全部使った。ネットワークの土台も、その上に立つセキュリティも、そして技術と法と社会は分けられないという一番大事なことも。\n\n夜が明ける。おつかれさま。次のシフトで、また会おう。',
      handoffTemplate: '━━━ インシデント引き継ぎメモ ━━━\n発生時間帯:00:00〜06:00(夜勤帯)\n担当:当直アナリスト\n\n【概要】\n単発のIoTスキャン検知に始まり、DDoS・Web改ざん・AiTMフィッシングへと連鎖した一連の標的型攻撃。相関分析により、四つの事象は単一のキルチェーンであることを確認。\n\n【時系列】\n01:42 初期侵入 — 複合機(mfp-3f)がMirai型辞書攻撃で乗っ取り\n02:51 陽動 — 乗っ取りIoT群による自社WebへのDDoS(本命を隠す煙幕)\n04:10 改ざん — 放置CVEを突かれ公開JSにバックドア設置\n05:20 情報流出 — AiTMで窃取した認証情報による持ち出し(C2:c2.nightowl.example)\n\n【実施した対応】\n・攻撃元IPの特定と遮断\n・DDoS緩和(流入制御/処理増強)\n・改ざんファイルのハッシュ照合による特定\n・感染機器・侵害経路の隔離\n・キルチェーンの相関分析と封じ込め判断\n\n【日勤への申し送り】\n・複合機のファーム更新と初期パスワード変更(再発防止)\n・全社的な多要素認証の再確認(AiTM耐性のある方式へ)\n・放置IoT機器の棚卸しとNOTICE観点での点検\n・被害者(経理担当)のプライバシーに配慮した報告書作成\n\n引き継ぎ以上。よい一日を。'
    }
  };

  window.NSD = window.NSD || {};
  window.NSD.STORY = STORY;
})();
