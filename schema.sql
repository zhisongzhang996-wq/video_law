-- videos: 记录上传的视频与选择的类型（逗号分隔）
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  types TEXT NOT NULL,                 -- 例如 "校园暴力,公共安全"
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- statutes: 法条库（按 category 分类，与页面类型一一对应）
CREATE TABLE IF NOT EXISTS statutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,              -- 与“类型”对应
  law_name TEXT NOT NULL,              -- 法律名称
  article TEXT NOT NULL,               -- 条文编号/标题
  content TEXT NOT NULL                -- 条文内容摘要
);

-- 示例法条数据（可自行扩充/修改）
INSERT INTO statutes (category, law_name, article, content) VALUES
('校园暴力', '中华人民共和国未成年人保护法', '第五十一条', '学校应当建立预防学生欺凌制度，及时制止与处理欺凌行为。'),
('校园暴力', '中华人民共和国治安管理处罚法', '第四十三条', '殴打他人的，或者故意伤害他人身体的，处警告、罚款或者行政拘留。'),
('交通安全', '中华人民共和国道路交通安全法', '第二十二条', '驾驶机动车应当遵守道路交通安全法律法规，不得疲劳驾驶、酒后驾驶。'),
('网络侵权', '中华人民共和国民法典', '第一千零二十四条', '自然人享有名誉权，任何组织或个人不得以侮辱、诽谤等方式侵害他人名誉权。'),
('环境保护', '中华人民共和国环境保护法', '第六条', '任何单位和个人都有保护环境的义务。'),
('公共安全', '中华人民共和国刑法', '第一百一十四条', '以危险方法危害公共安全，尚未造成严重后果的，处三年以上十年以下有期徒刑。');
