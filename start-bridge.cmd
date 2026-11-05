@echo off
rem 起桥，日志追加到本目录的 bridge.log。计划任务和手工都能用。
cd /d "%~dp0"
node arena_bridge.js >> "%~dp0bridge.log" 2>&1
