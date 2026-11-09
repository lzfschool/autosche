#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
拔河賽自動賽程表 - 多人即時同步伺服器 (支援 4G/5G 行動網路外網穿透)
提供跨裝置、手機、平板與大螢幕即時同步戰況。
"""

import http.server
import socketserver
import json
import os
import sys
import socket
import threading
import time
import urllib.parse
import webbrowser
import subprocess
import re
import atexit

# 修正 Windows 終端機 cp950 編碼問題
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

PORT = 8080
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tournament_data.json")

# 預設三組年級名單與籤位結構
DEFAULT_DATA = {
    "g1": {
        "title": "高一拔河賽 賽程表",
        "teams": [
            "109", "104", "資一甲", "113", "電一甲", "111", "107", "101",
            "112", "108", "110", "106", "105", "資一乙", "103"
        ],
        "results": {}
    },
    "g2": {
        "title": "高二拔河賽 賽程表",
        "teams": [
            "211", "206", "204", "208", "205", "201", "209", "體二甲",
            "207", "電二甲", "202", "資二乙", "213", "資二甲", "210", "212", "203"
        ],
        "results": {}
    },
    "g3": {
        "title": "高三拔河賽 賽程表",
        "teams": [
            "304", "307", "301", "電三甲", "310", "308", "312",
            "資三乙", "303", "313", "306", "資三甲", "309"
        ],
        "results": {}
    },
    "custom": {
        "title": "自訂錦標賽 賽程表",
        "teams": ["隊伍01", "隊伍02", "隊伍03", "隊伍04", "隊伍05", "隊伍06", "隊伍07", "隊伍08"],
        "results": {}
    }
}

public_tunnel_url = None
tunnel_process = None

# 取得本機區域網路 IP
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

# 讀取現有資料
def load_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                for k in DEFAULT_DATA:
                    if k not in saved:
                        saved[k] = DEFAULT_DATA[k]
                return saved
        except Exception as e:
            print(f"[Warning] 讀取既有資料失敗: {e}，將使用預設設定")
    return DEFAULT_DATA

def save_data(data):
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Error] 儲存資料失敗: {e}")

tournament_store = load_data()
clients_lock = threading.Lock()
sse_clients = []

def broadcast_update(update_payload):
    data_str = json.dumps(update_payload, ensure_ascii=False)
    message = f"event: tournament_update\ndata: {data_str}\n\n".encode("utf-8")
    with clients_lock:
        to_remove = []
        for client in sse_clients:
            try:
                client.wfile.write(message)
                client.wfile.flush()
            except Exception:
                to_remove.append(client)
        for dead in to_remove:
            if dead in sse_clients:
                sse_clients.remove(dead)

# 自動啟動 Cloudflare 穿透 (提供免同 Wi-Fi 即可全網連線)
def start_cloudflared_tunnel():
    global public_tunnel_url, tunnel_process
    cf_exe = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloudflared.exe")
    if not os.path.exists(cf_exe):
        print("[Notice] 未發現 cloudflared.exe，將僅啟用區域網路同步")
        return

    def run_tunnel():
        global public_tunnel_url, tunnel_process
        try:
            cmd = [cf_exe, "tunnel", "--url", f"http://localhost:{PORT}"]
            tunnel_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace"
            )
            for line in iter(tunnel_process.stdout.readline, ''):
                match = re.search(r'(https://[a-zA-Z0-9-]+\.trycloudflare\.com)', line)
                if match:
                    public_tunnel_url = match.group(1)
                    print("\n" + "=" * 64)
                    print("🌐 [4G/5G 行動網路免同 Wi-Fi 外網專用網址已啟動！]")
                    print(f"👉 外網安全網址： {public_tunnel_url}")
                    print("💡 手機無論在任何電信網路、不用連同個 Wi-Fi，打開都能同步！")
                    print("=" * 64 + "\n")
                    broadcast_update({
                        "type": "server_info",
                        "public_url": public_tunnel_url
                    })
                    break
        except Exception as e:
            print(f"[Tunnel Error] {e}")

    t = threading.Thread(target=run_tunnel, daemon=True)
    t.start()

def cleanup():
    global tunnel_process
    if tunnel_process:
        try:
            tunnel_process.terminate()
        except Exception:
            pass

atexit.register(cleanup)

class SyncHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # 1. 取得所有賽程資料 API
        if parsed.path == "/api/data":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            payload = {
                "server_ip": get_local_ip(),
                "port": PORT,
                "public_url": public_tunnel_url,
                "data": tournament_store
            }
            self.wfile.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))
            return

        # 2. 伺服器 IP 與狀態 API
        if parsed.path == "/api/info":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            with clients_lock:
                active_count = len(sse_clients)
            info = {
                "ip": get_local_ip(),
                "port": PORT,
                "clients": active_count,
                "local_url": f"http://{get_local_ip()}:{PORT}",
                "public_url": public_tunnel_url
            }
            self.wfile.write(json.dumps(info, ensure_ascii=False).encode("utf-8"))
            return

        # 3. Server-Sent Events (SSE) 即時廣播通道
        if parsed.path == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            with clients_lock:
                sse_clients.append(self)
                print(f"[SSE] 裝置連線！目前即時同步連線數：{len(sse_clients)}")

            init_payload = {
                "tournament_data": tournament_store,
                "public_url": public_tunnel_url
            }
            init_msg = f"event: initial_sync\ndata: {json.dumps(init_payload, ensure_ascii=False)}\n\n".encode("utf-8")
            try:
                self.wfile.write(init_msg)
                self.wfile.flush()
                while True:
                    time.sleep(15)
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
            except Exception:
                pass
            finally:
                with clients_lock:
                    if self in sse_clients:
                        sse_clients.remove(self)
                    print(f"[SSE] 裝置離線。目前即時同步連線數：{len(sse_clients)}")
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/update":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                req = json.loads(body)
                grade = req.get("grade")
                action = req.get("action")
                
                if grade and grade in tournament_store:
                    if action == "set_result":
                        match_id = str(req.get("matchId"))
                        side = req.get("side")
                        if side is None:
                            tournament_store[grade]["results"].pop(match_id, None)
                        else:
                            tournament_store[grade]["results"][match_id] = side
                    
                    elif action == "reset_results":
                        tournament_store[grade]["results"] = {}

                    elif action == "set_teams":
                        tournament_store[grade]["teams"] = req.get("teams", [])
                        tournament_store[grade]["results"] = {}

                    elif action == "full_grade_update":
                        if "teams" in req:
                            tournament_store[grade]["teams"] = req["teams"]
                        if "results" in req:
                            tournament_store[grade]["results"] = req["results"]
                        if "title" in req:
                            tournament_store[grade]["title"] = req["title"]

                    save_data(tournament_store)

                    broadcast_update({
                        "grade": grade,
                        "data": tournament_store[grade],
                        "timestamp": time.time()
                    })

                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "ok"}).encode("utf-8"))
                    return
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                return

        self.send_response(404)
        self.end_headers()

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

def run_server():
    local_ip = get_local_ip()
    server_address = ("0.0.0.0", PORT)
    httpd = ThreadingTCPServer(server_address, SyncHTTPHandler)

    print("=" * 64)
    print("🏆 拔河賽自動賽程系統 - 多人即時同步伺服器 已啟動！")
    print("=" * 64)
    print(f"📡 本機電腦開啟：   http://localhost:{PORT}")
    print(f"📱 區域網路 (同Wi-Fi)： http://{local_ip}:{PORT}")
    print("🌐 正在為您建立 4G/5G 行動網路免同 Wi-Fi 穿透連線...")
    print("=" * 64)

    # 啟動 Cloudflare 穿透
    start_cloudflared_tunnel()

    httpd.serve_forever()

if __name__ == "__main__":
    run_server()
