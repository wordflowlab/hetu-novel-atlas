# 操作地图

由正式清单生成，执行前发现当前安装版Schema。

| 动作 | 用途 | 必填参数 | 效果 |
| --- | --- | --- | --- |
| list_projects | 查找方案 |  | read |
| get_project | 读取固定方案 | object_id | read |
| save_project | 保存完整方案 | expected_revision, expected_sha256, operation_key, content | managed_write |
| put_node | 维护实体 | object_id, expected_revision, expected_sha256, operation_key, node | managed_write |
| remove_node | 移除专业记录 | object_id, expected_revision, expected_sha256, operation_key, node_id | managed_write |
| put_relation | 维护关系 | object_id, expected_revision, expected_sha256, operation_key, relation | managed_write |
| remove_relation | 移除专业记录 | object_id, expected_revision, expected_sha256, operation_key, relation_id | managed_write |
| put_event | 维护事件 | object_id, expected_revision, expected_sha256, operation_key, event | managed_write |
| remove_event | 移除专业记录 | object_id, expected_revision, expected_sha256, operation_key, event_id | managed_write |
| set_layout | 保存投影布局 | object_id, expected_revision, expected_sha256, operation_key, layout | managed_write |
| project_blueprint | 投影固定设定 | object_id, source_index | read |
| get_projection | 读取专业视图 | object_id, view | read |
| get_source | 读取固定依据 | object_id, source_index | read |
| compare_versions | 比较专业修订 | object_id, from_revision, to_revision | read |
| export_project | 导出固定报告 | object_id, format | read |
| get_operation | 回读原操作 | operation_key | read |
| put_place_geometry | 保存明确空间坐标 | object_id, expected_revision, expected_sha256, operation_key, geometry | managed_write |
| put_route_segment | 保存有据人物行程 | object_id, expected_revision, expected_sha256, operation_key, route | managed_write |
| put_observation | 保存变化与流转观测 | object_id, expected_revision, expected_sha256, operation_key, observation | managed_write |
| put_extraction_run | 保存真实抽取覆盖 | object_id, expected_revision, expected_sha256, operation_key, extraction | managed_write |
| preview_projection_update | 预览新来源影响 | object_id, changed_source_indices | read |
| get_projection_bundle | 读取固定多视图与依据 | object_id | read |
| save_depth | 保存明确专业深化结构 | object_id, expected_revision, expected_sha256, operation_key, depth | managed_write |
| inspect_basis | 读取同作品固定专业依据 | object_id, basis_index | read |
