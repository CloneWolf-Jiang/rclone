#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TMDB 电视剧文件智能重命名工具 - Web 版本
提供图形化Web界面进行批量重命名

使用方法：
  python tmdb-renamer.py /path/to/tv/series [port]
  
例如：
  python tmdb-renamer.py "D:/TV/Breaking Bad" 8000
  python tmdb-renamer.py ~/TV/Shows 9000
  
然后在浏览器中访问：http://localhost:8000
"""

import os
import re
import sys
import json
import logging
import argparse
import threading
from pathlib import Path
from typing import Dict, List, Tuple, Optional
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import requests
import base64
import hashlib

# Phase 2 模板引擎 - 改进的导入机制
PHASE2_ENABLED = False
TemplateRuleEngine = None
load_rules_from_json = None

try:
    # 方式1: 尝试直接导入（同目录）
    from template_engine import TemplateRuleEngine, load_rules_from_json
    PHASE2_ENABLED = True
except ImportError:
    try:
        # 方式2: 尝试从脚本所在目录导入（处理不同工作目录）
        script_dir = Path(__file__).parent.absolute()
        if str(script_dir) not in sys.path:
            sys.path.insert(0, str(script_dir))
        from template_engine import TemplateRuleEngine, load_rules_from_json
        PHASE2_ENABLED = True
    except ImportError as e:
        PHASE2_ENABLED = False
        # 延迟创建 logger（因为此时还未配置）
        pass

# 日志配置
# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('tmdb_renamer.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# 检查 Phase 2 引擎是否加载成功
if not PHASE2_ENABLED:
    logger.warning("⚠️  无法导入 Phase 2 模板引擎，将使用原始规则系统")


class ConfigManager:
    """配置文件管理器 - 统一管理所有配置项"""
    
    # 默认配置结构
    DEFAULT_CONFIG = {
        'api': {
            'key': '',              # 加密的API密钥
            'language': 'zh-CN',    # TMDB API 语言
            'timeout': 10           # 请求超时时间（秒）
        },
        'naming': {
            'include_episode_name': True,   # 是否包含剧集名称
            'episode_separator': ' - ',     # 季集与剧名分隔符
            'format_style': 'default'       # 命名格式风格
        },
        'behavior': {
            'dry_run': False,       # 干运行模式（仅预览）
            'interactive': False,   # 交互模式
            'batch_mode': False     # 批处理模式
        },
        'rules': {
            'custom': [             # 自定义规则列表
                # 示例：
                # {
                #   "name": "01x01 格式",
                #   "pattern": r"(\d{1,2})x(\d{1,2})",
                #   "description": "匹配 01x01 格式",
                #   "enabled": True
                # }
            ]
        }
    }
    
    def __init__(self, config_dir: str = "./config"):
        self.config_dir = Path(config_dir)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.config_file = self.config_dir / "config.conf"  # 统一的配置文件
        self.encryption_key = b"tmdb_renamer_key_2026"  # 加密密钥
        
        # 初始化时进行迁移（如果需要）
        self._migrate_legacy_config()
    
    def _migrate_legacy_config(self):
        """从旧配置文件迁移数据"""
        # 检查是否已经是新格式
        if self.config_file.exists():
            config = self._load_raw_config()
            if 'api' in config:  # 已是新格式
                return
            
            # 旧格式迁移
            if 'api_key' in config:
                api_key = config.get('api_key', '')
                if api_key:
                    self.set_value('api.key', api_key)
                    logger.info("✓ 旧配置已迁移到新格式")
    
    def _encrypt(self, text: str) -> str:
        """XOR + Base64 加密"""
        text_bytes = text.encode('utf-8')
        key_bytes = self.encryption_key * ((len(text_bytes) // len(self.encryption_key)) + 1)
        encrypted = bytes(a ^ b for a, b in zip(text_bytes, key_bytes[:len(text_bytes)]))
        return base64.b64encode(encrypted).decode('utf-8')
    
    def _decrypt(self, encrypted_text: str) -> str:
        """XOR + Base64 解密"""
        try:
            encrypted_bytes = base64.b64decode(encrypted_text.encode('utf-8'))
            key_bytes = self.encryption_key * ((len(encrypted_bytes) // len(self.encryption_key)) + 1)
            decrypted = bytes(a ^ b for a, b in zip(encrypted_bytes, key_bytes[:len(encrypted_bytes)]))
            return decrypted.decode('utf-8')
        except Exception as e:
            logger.warning(f"解密失败: {e}")
            return ""
    
    def _load_raw_config(self) -> Dict:
        """加载原始配置（不解密）"""
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"加载配置失败: {e}")
        return {}
    
    def _save_raw_config(self, config: Dict) -> bool:
        """保存原始配置（不加密）"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"保存配置文件失败: {e}")
            return False
    
    def get_value(self, path: str, default=None):
        """获取配置值（支持路径：'api.key', 'naming.include_episode_name'）"""
        config = self._load_raw_config()
        
        # 如果配置为空，使用默认值
        if not config:
            config = self.DEFAULT_CONFIG.copy()
        
        parts = path.split('.')
        current = config
        
        for part in parts:
            if isinstance(current, dict):
                if part in current:
                    current = current[part]
                else:
                    return default
            else:
                return default
        
        # 特殊处理：解密 API 密钥
        if path == 'api.key' and current:
            return self._decrypt(current)
        
        return current
    
    def set_value(self, path: str, value) -> bool:
        """设置配置值（支持路径：'api.key', 'naming.include_episode_name'）"""
        try:
            config = self._load_raw_config()
            
            # 初始化为默认结构
            if not config:
                config = json.loads(json.dumps(self.DEFAULT_CONFIG))
            
            parts = path.split('.')
            
            # 特殊处理：加密 API 密钥
            if path == 'api.key':
                value = self._encrypt(value) if value else ''
            
            # 导航到目标位置
            current = config
            for part in parts[:-1]:
                if part not in current:
                    current[part] = {}
                current = current[part]
            
            # 设置值
            current[parts[-1]] = value
            
            return self._save_raw_config(config)
        except Exception as e:
            logger.error(f"设置配置失败 ({path}): {e}")
            return False
    
    def get_all_config(self) -> Dict:
        """获取完整配置（不包含加密的API密钥）"""
        config = self._load_raw_config()
        if not config:
            config = self.DEFAULT_CONFIG.copy()
        
        # API密钥使用掩码
        if 'api' in config and 'key' in config['api']:
            api_key = config['api']['key']
            if api_key:
                try:
                    decrypted = self._decrypt(api_key)
                    config['api']['key'] = decrypted[:10] + '***' if len(decrypted) > 10 else '***'
                except:
                    config['api']['key'] = '***'
            else:
                config['api']['key'] = ''
        
        return config
    
    def save_api_key(self, api_key: str) -> bool:
        """保存加密的API密钥（兼容旧代码）"""
        if self.set_value('api.key', api_key):
            logger.info("API密钥已保存")
            return True
        return False
    
    def get_api_key(self) -> str:
        """获取解密的API密钥（兼容旧代码）"""
        return self.get_value('api.key', '')
    
    def load_config(self) -> Dict:
        """加载完整配置（兼容旧代码）"""
        return self._load_raw_config()
    
    def save_config(self, data: Dict) -> bool:
        """保存配置（兼容旧代码）"""
        return self._save_raw_config(data)
    
    # ==================== 自定义规则管理 ====================
    
    def get_rules(self) -> List[Dict]:
        """获取所有自定义规则"""
        return self.get_value('rules.custom', [])
    
    def add_rule(self, name: str, pattern: str, description: str = '') -> bool:
        """添加新规则"""
        try:
            rules = self.get_rules()
            
            # 检查规则名称是否已存在
            if any(r.get('name') == name for r in rules):
                logger.warning(f"规则名称已存在: {name}")
                return False
            
            # 验证正则表达式
            try:
                re.compile(pattern)
            except re.error as e:
                logger.error(f"正则表达式错误: {e}")
                return False
            
            # 添加新规则
            new_rule = {
                'name': name,
                'pattern': pattern,
                'description': description,
                'enabled': True
            }
            rules.append(new_rule)
            
            # 保存
            config = self._load_raw_config()
            if 'rules' not in config:
                config['rules'] = {}
            config['rules']['custom'] = rules
            
            if self._save_raw_config(config):
                logger.info(f"规则已添加: {name}")
                return True
            return False
        except Exception as e:
            logger.error(f"添加规则失败: {e}")
            return False
    
    def delete_rule(self, name: str) -> bool:
        """删除规则"""
        try:
            rules = self.get_rules()
            new_rules = [r for r in rules if r.get('name') != name]
            
            if len(new_rules) == len(rules):
                logger.warning(f"规则未找到: {name}")
                return False
            
            config = self._load_raw_config()
            if 'rules' not in config:
                config['rules'] = {}
            config['rules']['custom'] = new_rules
            
            if self._save_raw_config(config):
                logger.info(f"规则已删除: {name}")
                return True
            return False
        except Exception as e:
            logger.error(f"删除规则失败: {e}")
            return False
    
    def update_rule(self, name: str, pattern: str = None, description: str = None, enabled: bool = None) -> bool:
        """更新规则"""
        try:
            rules = self.get_rules()
            
            # 查找规则
            rule_index = next((i for i, r in enumerate(rules) if r.get('name') == name), None)
            if rule_index is None:
                logger.warning(f"规则未找到: {name}")
                return False
            
            rule = rules[rule_index]
            
            # 更新字段
            if pattern is not None:
                try:
                    re.compile(pattern)
                    rule['pattern'] = pattern
                except re.error as e:
                    logger.error(f"正则表达式错误: {e}")
                    return False
            
            if description is not None:
                rule['description'] = description
            
            if enabled is not None:
                rule['enabled'] = enabled
            
            rules[rule_index] = rule
            
            config = self._load_raw_config()
            if 'rules' not in config:
                config['rules'] = {}
            config['rules']['custom'] = rules
            
            if self._save_raw_config(config):
                logger.info(f"规则已更新: {name}")
                return True
            return False
        except Exception as e:
            logger.error(f"更新规则失败: {e}")
            return False
    
    def test_rule(self, pattern: str, test_string: str) -> Dict:
        """测试正则表达式规则"""
        try:
            regex = re.compile(pattern)
            match = regex.search(test_string)
            
            if match:
                groups = match.groups()
                if len(groups) >= 2:
                    season = int(groups[0])
                    episode = int(groups[1])
                    return {
                        'success': True,
                        'matched': match.group(0),
                        'season': season,
                        'episode': episode
                    }
                else:
                    return {
                        'success': False,
                        'error': f'正则表达式必须包含至少2个捕获组（当前：{len(groups)}个）'
                    }
            else:
                return {
                    'success': False,
                    'error': '正则表达式不匹配文本'
                }
        except re.error as e:
            return {
                'success': False,
                'error': f'正则表达式错误: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'测试失败: {str(e)}'
            }


class TMDBClient:
    """TMDB API 客户端"""
    
    def __init__(self, api_key: str, language: str = 'zh-CN'):
        self.api_key = api_key
        self.language = language
        self.base_url = "https://api.themoviedb.org/3"
        self.cache = {}
    
    def search_tv_series(self, series_name: str) -> Optional[List[Dict]]:
        """搜索电视剧"""
        try:
            endpoint = f"{self.base_url}/search/tv"
            params = {
                'api_key': self.api_key,
                'query': series_name,
                'language': self.language,
                'page': 1
            }
            
            response = requests.get(endpoint, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            results = data.get('results', [])
            
            # 返回前10个结果
            return results[:10] if results else []
            
        except Exception as e:
            logger.error(f"搜索电视剧失败: {e}")
            return None
    
    def get_season_episodes(self, series_id: int, season_number: int) -> Optional[Dict]:
        """获取季的所有剧集"""
        cache_key = f"{series_id}_s{season_number}"
        
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        try:
            endpoint = f"{self.base_url}/tv/{series_id}/season/{season_number}"
            params = {
                'api_key': self.api_key,
                'language': self.language
            }
            
            response = requests.get(endpoint, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            self.cache[cache_key] = data
            return data
            
        except Exception as e:
            logger.error(f"获取季度信息失败: {e}")
            return None
    
    def get_episode_name(self, series_id: int, season: int, episode: int) -> Optional[str]:
        """获取剧集名称"""
        season_data = self.get_season_episodes(series_id, season)
        
        if not season_data:
            return None
        
        episodes = season_data.get('episodes', [])
        
        for ep in episodes:
            if ep.get('episode_number') == episode:
                return ep.get('name', f'Episode {episode}')
        
        return None

    def get_series_details(self, series_id: int) -> Optional[Dict]:
        """获取电视剧详细信息，包括所有季份"""
        try:
            endpoint = f"{self.base_url}/tv/{series_id}"
            params = {
                'api_key': self.api_key,
                'language': self.language
            }
            
            response = requests.get(endpoint, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            
            # 提取关键信息
            result = {
                'id': data.get('id'),
                'name': data.get('name'),
                'overview': data.get('overview'),
                'first_air_date': data.get('first_air_date'),
                'last_air_date': data.get('last_air_date'),
                'number_of_seasons': data.get('number_of_seasons', 0),
                'poster_path': data.get('poster_path'),
                'seasons': []
            }
            
            # 提取季份信息
            seasons = data.get('seasons', [])
            for season in seasons:
                if season.get('season_number', -1) >= 0:  # 排除特殊季（如0季）
                    result['seasons'].append({
                        'season_number': season.get('season_number'),
                        'episode_count': season.get('episode_count', 0),
                        'air_date': season.get('air_date'),
                        'poster_path': season.get('poster_path')
                    })
            
            return result
            
        except Exception as e:
            logger.error(f"获取电视剧详细信息失败: {e}")
            return None


class FileSystemManager:
    """文件系统和目录树管理器"""
    
    VIDEO_EXTENSIONS = {'.mkv', '.mp4', '.avi', '.mov', '.flv', '.wmv', '.webm', '.m4v'}
    
    @staticmethod
    def get_directory_tree(path: str) -> Dict:
        """获取目录树结构"""
        path = Path(path).resolve()
        
        if not path.exists() or not path.is_dir():
            return {'error': f'目录不存在: {path}'}
        
        def build_tree(dir_path: Path, max_depth: int = 3, current_depth: int = 0) -> Dict:
            if current_depth > max_depth:
                return {}
            
            tree = {
                'name': dir_path.name or str(dir_path),
                'path': str(dir_path),
                'type': 'folder',
                'children': []
            }
            
            try:
                items = sorted(dir_path.iterdir())
                
                for item in items:
                    if item.is_file() and item.suffix.lower() not in FileSystemManager.VIDEO_EXTENSIONS:
                        continue
                    
                    if item.is_dir():
                        tree['children'].append(build_tree(item, max_depth, current_depth + 1))
                    elif item.is_file():
                        stat = item.stat()
                        tree['children'].append({
                            'name': item.name,
                            'path': str(item),
                            'type': 'file',
                            'size': stat.st_size,
                            'mtime': stat.st_mtime
                        })
            except PermissionError:
                pass
            
            return tree
        
        return build_tree(path)
    
    @staticmethod
    def extract_season_episode(filename: str) -> Optional[Tuple[int, int]]:
        """提取文件名中的季数和集数"""
        patterns = [
            (r'[Ss](\d{1,2})[Ee](\d{1,2})', 'standard'),
            (r'(\d{1,2})[xX](\d{1,2})', 'x_format'),
            (r'(\d{1,2})[.\-](\d{1,2})', 'dot_format'),
        ]
        
        for pattern, _ in patterns:
            match = re.search(pattern, filename)
            if match:
                season = int(match.group(1))
                episode = int(match.group(2))
                return season, episode
        
        return None
    
    @staticmethod
    def sanitize_filename(name: str) -> str:
        """清理文件名"""
        illegal_chars = r'[<>:"/\\|?*]'
        name = re.sub(illegal_chars, '', name)
        name = re.sub(r'\s+', ' ', name).strip()
        return name
    
    @staticmethod
    def build_new_filename(series_name: str, season: int, episode: int, 
                          episode_name: Optional[str], original_ext: str) -> str:
        """构建新文件名"""
        series_name = FileSystemManager.sanitize_filename(series_name)
        
        if episode_name:
            episode_name = FileSystemManager.sanitize_filename(episode_name)
            return f"{series_name} S{season:02d}E{episode:02d} - {episode_name}{original_ext}"
        else:
            return f"{series_name} S{season:02d}E{episode:02d}{original_ext}"


class WebRequestHandler(SimpleHTTPRequestHandler):
    """HTTP 请求处理器"""
    
    # 类变量，由主程序设置
    tv_directory = None
    config_manager = None
    tmdb_client = None
    phase2_engine = None  # Phase 2 模板引擎（如果可用）
    
    def do_GET(self):
        """处理 GET 请求"""
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        query_params = parse_qs(parsed_url.query)
        
        # 静态文件服务
        if path == '/' or path == '/index.html':
            try:
                with open('static/index.html', 'r', encoding='utf-8') as f:
                    content = f.read().encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', len(content))
                self.end_headers()
                self.wfile.write(content)
            except FileNotFoundError:
                self.send_error(404, "Page not found")
            return
        
        if path.startswith('/static/'):
            return self._serve_static_file(path)
        
        # 处理 favicon 请求
        if path == '/favicon.ico':
            return self._serve_static_file('/static/favicon.ico')
        
        # API 接口
        if path == '/api/directory-tree':
            return self._api_directory_tree()
        
        if path == '/api/search-series':
            query = query_params.get('q', [''])[0]
            return self._api_search_series(query)
        
        if path == '/api/series-details':
            series_id = query_params.get('series_id', [''])[0]
            return self._api_series_details(series_id)
        
        if path == '/api/get-episodes':
            series_id = query_params.get('series_id', [''])[0]
            season = query_params.get('season', ['1'])[0]
            return self._api_get_episodes(series_id, season)
        
        if path == '/api/get-api-key':
            return self._api_get_api_key()
        
        if path == '/api/get-config':
            return self._api_get_config()
        
        if path == '/api/get-rules':
            return self._api_get_rules()
        
        # Phase 2 API 端点
        if path == '/api/phase2/status':
            return self._api_phase2_status()
        
        if path == '/api/phase2/rules':
            return self._api_phase2_rules()
        
        if path == '/api/preview-rename':
            return self._api_preview_rename(query_params)
        
        return self._json_response({'error': 'API endpoint not found'}, 404)
    
    def do_POST(self):
        """处理 POST 请求"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(body)
        except Exception as e:
            return self._json_response({'error': f'Invalid JSON: {str(e)}'}, 400)
        
        path = self.path
        
        if path == '/api/save-api-key':
            return self._api_save_api_key(data)
        
        if path == '/api/update-config':
            return self._api_update_config(data)
        
        if path == '/api/rename-files':
            return self._api_rename_files(data)
        
        if path == '/api/extract-format':
            return self._api_extract_format(data)
        
        if path == '/api/add-rule':
            return self._api_add_rule(data)
        
        if path == '/api/delete-rule':
            return self._api_delete_rule(data)
        
        if path == '/api/update-rule':
            return self._api_update_rule(data)
        
        if path == '/api/test-rule':
            return self._api_test_rule(data)
        
        return self._json_response({'error': 'API endpoint not found'}, 404)
    
    def _serve_static_file(self, path: str):
        """服务静态文件"""
        file_path = path.lstrip('/')
        
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            
            self.send_response(200)
            
            if file_path.endswith('.html'):
                self.send_header('Content-Type', 'text/html; charset=utf-8')
            elif file_path.endswith('.css'):
                self.send_header('Content-Type', 'text/css; charset=utf-8')
            elif file_path.endswith('.js'):
                self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            else:
                self.send_header('Content-Type', 'application/octet-stream')
            
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404, "File not found")
    
    def _api_directory_tree(self):
        """获取目录树"""
        tree = FileSystemManager.get_directory_tree(self.tv_directory)
        return self._json_response(tree)
    
    def _api_search_series(self, query: str):
        """搜索电视剧"""
        if not query:
            return self._json_response({'error': '查询参数不足'}, 400)
        
        if not self.tmdb_client:
            logger.warning("TMDB客户端未初始化 - 请先保存API密钥")
            return self._json_response({'error': '请先在设置中保存API密钥', 'requires_api_key': True}, 400)
        
        results = self.tmdb_client.search_tv_series(query)
        
        if results is None:
            return self._json_response({'error': 'TMDB API请求失败，请检查API密钥是否有效'}, 500)
        
        # 格式化结果
        formatted = []
        for r in results:
            formatted.append({
                'id': r.get('id'),
                'name': r.get('name'),
                'first_air_date': r.get('first_air_date'),
                'overview': r.get('overview', '')[:200],
                'poster_path': r.get('poster_path'),
            })
        
        return self._json_response({'results': formatted})
    
    def _api_series_details(self, series_id: str):
        """获取电视剧详细信息，包括所有季份"""
        if not series_id or not self.tmdb_client:
            return self._json_response({'error': '参数不足或API未初始化'}, 400)
        
        try:
            series_id = int(series_id)
        except ValueError:
            return self._json_response({'error': 'series_id 必须是整数'}, 400)
        
        details = self.tmdb_client.get_series_details(series_id)
        
        if details is None:
            return self._json_response({'error': '获取电视剧详细信息失败'}, 500)
        
        return self._json_response(details)
    
    def _api_get_episodes(self, series_id: str, season: str):
        """获取剧集"""
        if not series_id or not self.tmdb_client:
            return self._json_response({'error': '参数不足'}, 400)
        
        try:
            series_id = int(series_id)
            season = int(season)
        except ValueError:
            return self._json_response({'error': '参数格式错误'}, 400)
        
        season_data = self.tmdb_client.get_season_episodes(series_id, season)
        
        if not season_data:
            return self._json_response({'error': '获取剧集失败'}, 500)
        
        episodes = []
        for ep in season_data.get('episodes', []):
            episodes.append({
                'episode_number': ep.get('episode_number'),
                'name': ep.get('name'),
                'overview': ep.get('overview', '')[:100],
            })
        
        return self._json_response({'episodes': episodes})
    
    def _api_get_api_key(self):
        """获取API密钥状态"""
        api_key = self.config_manager.get_api_key()
        has_key = bool(api_key)
        
        return self._json_response({
            'has_api_key': has_key,
            'api_key': api_key if has_key else ''  # 返回完整API Key（不是隐藏版本）
        })
    
    def _api_get_config(self):
        """获取完整配置（不包含敏感信息）"""
        config = self.config_manager.get_all_config()
        return self._json_response(config)
    
    def _api_update_config(self, data: Dict):
        """更新配置项
        格式：{'path': 'api.key', 'value': 'xxx'} 或 {'api': {...}, 'naming': {...}} 等"""
        try:
            # 支持两种格式：单项更新或完整配置更新
            if 'path' in data and 'value' in data:
                # 单项更新
                path = data.get('path', '')
                value = data.get('value')
                
                if not path:
                    return self._json_response({'error': '路径不能为空'}, 400)
                
                if self.config_manager.set_value(path, value):
                    logger.info(f"配置已更新: {path}")
                    return self._json_response({'success': True, 'message': f'{path} 已更新'})
                else:
                    return self._json_response({'error': '保存配置失败'}, 500)
            else:
                return self._json_response({'error': '请提供 path 和 value 参数'}, 400)
        except Exception as e:
            logger.error(f"更新配置失败: {e}")
            return self._json_response({'error': f'更新失败: {str(e)}'}, 500)
    
    def _api_save_api_key(self, data: Dict):
        """保存API密钥"""
        api_key = data.get('api_key', '')
        
        if not api_key:
            return self._json_response({'error': 'API密钥不能为空'}, 400)
        
        if self.config_manager.save_api_key(api_key):
            # 更新类变量，使所有请求处理器实例共享
            WebRequestHandler.tmdb_client = TMDBClient(api_key)
            logger.info(f"API密钥已更新 - 前10位: {api_key[:10]}***")
            return self._json_response({'success': True, 'message': 'API密钥已保存'})
        else:
            return self._json_response({'error': '保存失败'}, 500)
    
    def _api_preview_rename(self, query_params: Dict):
        """预览文件重命名"""
        filename = query_params.get('filename', [''])[0]
        series_name = query_params.get('series_name', [''])[0]
        series_id = query_params.get('series_id', [''])[0]
        regex_pattern = query_params.get('regex', [''])[0]
        rule_mode = query_params.get('rule_mode', ['auto'])[0]  # auto | template | legacy
        
        if not filename or not series_name:
            return self._json_response({'error': '参数不足'}, 400)
        
        # ===== Phase 2 模板规则路径 =====
        new_filename = None
        phase2_result = None
        
        if self.phase2_engine and rule_mode in ['auto', 'template']:
            try:
                # 尝试使用 Phase 2 规则
                phase2_result = self.phase2_engine.process_filename(
                    filename,
                    options={'category': '常规'}
                )
                
                if phase2_result and phase2_result.get('success'):
                    new_filename = phase2_result.get('generated', filename)
                    logger.info(f"[Phase 2] 使用规则 {phase2_result.get('rule', {}).get('name')} 重命名: {filename} -> {new_filename}")
            except Exception as e:
                logger.warning(f"[Phase 2] 规则处理失败: {e}")
                if rule_mode == 'template':
                    # 强制使用 Phase 2，失败则返回错误
                    return self._json_response({
                        'error': f'Phase 2 规则处理失败: {e}'
                    }, 400)
        
        # ===== 回退到原始规则系统 =====
        if not new_filename and rule_mode in ['auto', 'legacy']:
            # 提取季集
            season_ep = FileSystemManager.extract_season_episode(filename)
            
            if not season_ep and not regex_pattern:
                return self._json_response({
                    'error': '无法识别季集',
                    'extracted': None
                })
            
            if regex_pattern:
                # 使用自定义正则
                try:
                    match = re.search(regex_pattern, filename)
                    if match and len(match.groups()) >= 2:
                        season = int(match.group(1))
                        episode = int(match.group(2))
                        season_ep = (season, episode)
                    else:
                        return self._json_response({'error': '正则表达式不匹配'}, 400)
                except Exception as e:
                    return self._json_response({'error': f'正则错误: {e}'}, 400)
            
            season, episode = season_ep
            file_ext = Path(filename).suffix
            
            # 获取剧集名称
            episode_name = None
            if series_id:
                try:
                    episode_name = self.tmdb_client.get_episode_name(int(series_id), season, episode)
                except:
                    pass
            
            new_filename = FileSystemManager.build_new_filename(
                series_name, season, episode, episode_name, file_ext
            )
            logger.info(f"[Legacy] 使用原始规则重命名: {filename} -> {new_filename}")
        
        if not new_filename:
            return self._json_response({
                'error': '无法生成新文件名'
            }, 400)
        
        return self._json_response({
            'original': filename,
            'new_name': new_filename,
            'season': season_ep[0] if season_ep else None,
            'episode': season_ep[1] if season_ep else None,
            'episode_name': phase2_result.get('extracted', {}).get('episode_name') if phase2_result else None,
            'rule_mode_used': 'template' if phase2_result and phase2_result.get('success') else 'legacy'
        })
    
    def _api_extract_format(self, data: Dict):
        """从示例文件名提取正则表达式"""
        example_filename = data.get('example', '')
        
        if not example_filename:
            return self._json_response({'error': '需要示例文件名'}, 400)
        
        # 尝试各种模式
        patterns = [
            (r'[Ss](\d{1,2})[Ee](\d{1,2})', 'standard (S##E##)'),
            (r'(\d{1,2})[xX](\d{1,2})', 'x格式 (##x##)'),
            (r'(\d{1,2})[.\-](\d{1,2})', '点号/连字符 (##.## or ##-##)'),
        ]
        
        detected = []
        for pattern, name in patterns:
            match = re.search(pattern, example_filename)
            if match:
                detected.append({
                    'pattern': pattern,
                    'name': name,
                    'matched': match.group(0),
                    'season': int(match.group(1)),
                    'episode': int(match.group(2))
                })
        
        if detected:
            return self._json_response({
                'detected_patterns': detected,
                'recommended': detected[0]
            })
        else:
            return self._json_response({
                'error': '无法识别文件名格式'
            }, 400)
    
    def _api_phase2_status(self):
        """获取 Phase 2 引擎状态"""
        status = {
            'enabled': self.phase2_engine is not None,
            'rules_count': 0
        }
        
        if self.phase2_engine:
            status['rules_count'] = len(self.phase2_engine.get_categories())
        
        return self._json_response(status)
    
    def _api_phase2_rules(self):
        """获取 Phase 2 规则配置"""
        if not self.phase2_engine:
            return self._json_response({
                'error': 'Phase 2 引擎未加载',
                'rules': {},
                'globalVariables': {}
            }, 503)
        
        # 返回规则和全局变量
        return self._json_response({
            'enabled': True,
            'rules': self.phase2_engine.substitution_rules,
            'globalVariables': self.phase2_engine.global_variables,
            'categories': self.phase2_engine.get_categories()
        })
    
    def _api_get_rules(self):
        """获取所有自定义规则"""
        rules = self.config_manager.get_rules()
        return self._json_response({'rules': rules})
    
    def _api_add_rule(self, data: Dict):
        """添加新规则"""
        name = data.get('name', '').strip()
        pattern = data.get('pattern', '').strip()
        description = data.get('description', '').strip()
        
        if not name or not pattern:
            return self._json_response({'error': '规则名称和正则表达式不能为空'}, 400)
        
        if self.config_manager.add_rule(name, pattern, description):
            return self._json_response({'success': True, 'message': f'规则已添加: {name}'})
        else:
            return self._json_response({'error': '添加规则失败（可能名称已存在或正则表达式无效）'}, 400)
    
    def _api_delete_rule(self, data: Dict):
        """删除规则"""
        name = data.get('name', '').strip()
        
        if not name:
            return self._json_response({'error': '规则名称不能为空'}, 400)
        
        if self.config_manager.delete_rule(name):
            return self._json_response({'success': True, 'message': f'规则已删除: {name}'})
        else:
            return self._json_response({'error': '删除规则失败（规则不存在）'}, 404)
    
    def _api_update_rule(self, data: Dict):
        """更新规则"""
        name = data.get('name', '').strip()
        
        if not name:
            return self._json_response({'error': '规则名称不能为空'}, 400)
        
        pattern = data.get('pattern')
        description = data.get('description')
        enabled = data.get('enabled')
        
        if self.config_manager.update_rule(name, pattern, description, enabled):
            return self._json_response({'success': True, 'message': f'规则已更新: {name}'})
        else:
            return self._json_response({'error': '更新规则失败'}, 400)
    
    def _api_test_rule(self, data: Dict):
        """测试规则"""
        pattern = data.get('pattern', '').strip()
        test_string = data.get('test_string', '').strip()
        
        if not pattern or not test_string:
            return self._json_response({'error': '正则表达式和测试字符串不能为空'}, 400)
        
        result = self.config_manager.test_rule(pattern, test_string)
        return self._json_response(result)
    
    def _api_rename_files(self, data: Dict):
        """执行文件重命名"""
        files = data.get('files', [])
        
        if not files:
            return self._json_response({'error': '没有要重命名的文件'}, 400)
        
        results = {'success': 0, 'failed': 0, 'errors': []}
        
        for file_info in files:
            try:
                original_path = file_info.get('original_path')
                new_name = file_info.get('new_name')
                
                if not original_path or not new_name:
                    results['failed'] += 1
                    results['errors'].append(f'信息不完整: {original_path}')
                    continue
                
                original_file = Path(original_path)
                new_file = original_file.parent / new_name
                
                if not original_file.exists():
                    results['failed'] += 1
                    results['errors'].append(f'文件不存在: {original_path}')
                    continue
                
                if new_file.exists() and new_file != original_file:
                    results['failed'] += 1
                    results['errors'].append(f'目标文件已存在: {new_name}')
                    continue
                
                original_file.rename(new_file)
                results['success'] += 1
                logger.info(f"已重命名: {original_path} -> {new_name}")
                
            except Exception as e:
                results['failed'] += 1
                results['errors'].append(f'重命名失败: {str(e)[:100]}')
                logger.error(f"重命名失败: {e}")
        
        return self._json_response(results)
    
    def _json_response(self, data: Dict, status: int = 200):
        """发送JSON响应"""
        content = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
        
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(content))
        self.end_headers()
        self.wfile.write(content)
    
    def log_message(self, format, *args):
        """抑制默认日志"""
        logger.info(format % args)


def cleanup_old_files(target_dir: str):
    """清理旧的脚本文件，保持目录整洁"""
    old_files = [
        'tmdb-tv-renamer.py',  # 原命令行版本
        'tmdb-renamer.ps1',    # PowerShell 脚本
        'tmdb-renamer.sh',     # Bash 脚本
    ]
    
    target_path = Path(target_dir)
    
    for old_file in old_files:
        file_path = target_path / old_file
        if file_path.exists():
            try:
                file_path.unlink()
                logger.info(f"已删除旧文件: {old_file}")
            except Exception as e:
                logger.warning(f"删除文件失败 {old_file}: {e}")


def main():
    """主程序"""
    parser = argparse.ArgumentParser(
        description='TMDB 电视剧文件智能重命名工具 - Web 版本',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
例如:
  python tmdb-renamer.py "D:/TV/Breaking Bad" 8000
  python tmdb-renamer.py ~/TV 9000
  
然后在浏览器中访问: http://localhost:8000
        '''
    )
    
    parser.add_argument('directory', help='电视剧目录（必须为目录）')
    parser.add_argument('port', type=int, nargs='?', default=8000, help='HTTP服务端口（默认8000）')
    parser.add_argument('--no-cleanup', action='store_true', help='不清理旧文件')
    
    args = parser.parse_args()
    
    # 验证目录
    tv_dir = Path(args.directory).resolve()
    
    if not tv_dir.exists():
        logger.error(f"目录不存在: {args.directory}")
        sys.exit(1)
    
    if not tv_dir.is_dir():
        logger.error(f"不是目录: {args.directory}")
        sys.exit(1)
    
    logger.info(f"电视剧目录: {tv_dir}")
    logger.info(f"HTTP服务端口: {args.port}")
    
    # 清理旧文件
    if not args.no_cleanup:
        script_dir = Path(__file__).parent
        cleanup_old_files(str(script_dir))
    
    # 初始化配置和API客户端
    config_manager = ConfigManager()
    api_key = config_manager.get_api_key()
    tmdb_client = TMDBClient(api_key) if api_key else None
    
    # 初始化 Phase 2 模板引擎
    phase2_engine = None
    if PHASE2_ENABLED:
        try:
            # 加载 Phase 2 规则
            rules_json_path = Path(__file__).parent / 'config' / 'substitution-rules.json'
            if rules_json_path.exists():
                substitution_rules, global_variables = load_rules_from_json(str(rules_json_path))
                phase2_engine = TemplateRuleEngine(substitution_rules, global_variables)
                logger.info(f"✓ Phase 2 模板引擎已加载（{len(substitution_rules)} 个规则分类）")
            else:
                logger.warning(f"⚠ Phase 2 规则文件未找到: {rules_json_path}")
        except Exception as e:
            logger.warning(f"⚠ 初始化 Phase 2 引擎失败: {e}，将使用原始规则系统")
    
    # 设置类变量
    WebRequestHandler.tv_directory = str(tv_dir)
    WebRequestHandler.config_manager = config_manager
    WebRequestHandler.tmdb_client = tmdb_client
    WebRequestHandler.phase2_engine = phase2_engine
    
    if api_key:
        logger.info(f"✓ 已加载API密钥 - 前10位: {api_key[:10]}***")
    else:
        logger.warning("⚠ 未找到API密钥，请在Web界面中设置")
    
    # 启动HTTP服务器
    try:
        server_address = ('', args.port)
        httpd = HTTPServer(server_address, WebRequestHandler)
        
        logger.info(f"=" * 60)
        logger.info(f"✓ HTTP服务已启动!")
        logger.info(f"")
        logger.info(f"📱 请在浏览器中打开:")
        logger.info(f"   http://localhost:{args.port}")
        logger.info(f"")
        logger.info(f"📁 处理目录: {tv_dir}")
        logger.info(f"")
        logger.info(f"按 Ctrl+C 停止服务")
        logger.info(f"=" * 60)
        
        httpd.serve_forever()
    
    except KeyboardInterrupt:
        logger.info("\n服务已停止")
        sys.exit(0)
    except Exception as e:
        logger.error(f"启动服务失败: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
