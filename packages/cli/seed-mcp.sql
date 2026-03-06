-- Seed realistic MCP tool events across existing sessions.
-- Patterns modeled on Brian's actual MCP server usage.
-- Clara (wallet) = heavy usage, Herd (portfolio) = moderate, Figma = occasional, others = light

-- Session test-001: "Building particle animation for landing page"
-- Checked wallet balance, used Figma for design reference
INSERT INTO tool_events (id, session_id, timestamp, tool_name, tool_category, success, error_category, file_extension, command_category, sequence_number, mcp_server, duration_ms)
VALUES
  ('mcp-001', 'test-001', 1772598300000, 'mcp__clara__wallet_session', 'interact', 1, NULL, NULL, NULL, 115, 'clara', 1200),
  ('mcp-002', 'test-001', 1772598310000, 'mcp__clara__wallet_dashboard', 'interact', 1, NULL, NULL, NULL, 116, 'clara', 2100),
  ('mcp-003', 'test-001', 1772598320000, 'mcp__herd__getWalletOverviewTool', 'interact', 1, NULL, NULL, NULL, 117, 'herd', 1800),
  ('mcp-004', 'test-001', 1772598400000, 'mcp__figma__get_design_context', 'interact', 1, NULL, NULL, NULL, 118, 'figma', 3200),
  ('mcp-005', 'test-001', 1772598410000, 'mcp__figma__get_screenshot', 'interact', 1, NULL, NULL, NULL, 119, 'figma', 2400),
  ('mcp-006', 'test-001', 1772598500000, 'mcp__clara__wallet_send', 'interact', 1, NULL, NULL, NULL, 120, 'clara', 4500),
  ('mcp-007', 'test-001', 1772598600000, 'mcp__vibe__vibe_status', 'interact', 1, NULL, NULL, NULL, 121, 'vibe', 800),
  ('mcp-008', 'test-001', 1772598700000, 'mcp__typefully__typefully_create_draft', 'interact', 1, NULL, NULL, NULL, 122, 'typefully', 1100);

-- Session test-002: "Fixing login redirect loop"
-- Heavy Clara/Herd usage (debugging auth flow involved wallet checks), signal402 probing
INSERT INTO tool_events (id, session_id, timestamp, tool_name, tool_category, success, error_category, file_extension, command_category, sequence_number, mcp_server, duration_ms)
VALUES
  ('mcp-009', 'test-002', 1772515500000, 'mcp__clara__wallet_session', 'interact', 1, NULL, NULL, NULL, 128, 'clara', 1100),
  ('mcp-010', 'test-002', 1772515510000, 'mcp__clara__wallet_dashboard', 'interact', 1, NULL, NULL, NULL, 129, 'clara', 1900),
  ('mcp-011', 'test-002', 1772515520000, 'mcp__herd__getWalletOverviewTool', 'interact', 1, NULL, NULL, NULL, 130, 'herd', 1600),
  ('mcp-012', 'test-002', 1772515600000, 'mcp__clara__wallet_send', 'interact', 0, 'timeout', NULL, NULL, 131, 'clara', 30000),
  ('mcp-013', 'test-002', 1772515700000, 'mcp__clara__wallet_send', 'interact', 1, NULL, NULL, NULL, 132, 'clara', 5200),
  ('mcp-014', 'test-002', 1772515800000, 'mcp__herd__getWalletOverviewTool', 'interact', 1, NULL, NULL, NULL, 133, 'herd', 1700),
  ('mcp-015', 'test-002', 1772515900000, 'mcp__signal402__signal402_recommend', 'interact', 1, NULL, NULL, NULL, 134, 'signal402', 2300),
  ('mcp-016', 'test-002', 1772516000000, 'mcp__signal402__signal402_call', 'interact', 1, NULL, NULL, NULL, 135, 'signal402', 3100),
  ('mcp-017', 'test-002', 1772516100000, 'mcp__signal402__signal402_probe', 'interact', 0, 'api_error', NULL, NULL, 136, 'signal402', 5000),
  ('mcp-018', 'test-002', 1772516200000, 'mcp__clara__wallet_sign', 'interact', 1, NULL, NULL, NULL, 137, 'clara', 2800),
  ('mcp-019', 'test-002', 1772516300000, 'mcp__conway-terminal__sandbox_exec', 'interact', 1, NULL, NULL, NULL, 138, 'conway-terminal', 4200),
  ('mcp-020', 'test-002', 1772516400000, 'mcp__conway-terminal__sandbox_exec', 'interact', 1, NULL, NULL, NULL, 139, 'conway-terminal', 3800);

-- Session test-003: "Extracting auth middleware into shared package"
-- Moderate MCP usage — checking Glorp for team context, Figma for component specs
INSERT INTO tool_events (id, session_id, timestamp, tool_name, tool_category, success, error_category, file_extension, command_category, sequence_number, mcp_server, duration_ms)
VALUES
  ('mcp-021', 'test-003', 1772429100000, 'mcp__clara__wallet_session', 'interact', 1, NULL, NULL, NULL, 113, 'clara', 1000),
  ('mcp-022', 'test-003', 1772429200000, 'mcp__herd__getWalletOverviewTool', 'interact', 1, NULL, NULL, NULL, 114, 'herd', 1500),
  ('mcp-023', 'test-003', 1772429300000, 'mcp__glorp__glorp_status', 'interact', 1, NULL, NULL, NULL, 115, 'glorp', 900),
  ('mcp-024', 'test-003', 1772429400000, 'mcp__glorp__glorp_send_message', 'interact', 1, NULL, NULL, NULL, 116, 'glorp', 1200),
  ('mcp-025', 'test-003', 1772429500000, 'mcp__figma__get_design_context', 'interact', 1, NULL, NULL, NULL, 117, 'figma', 3500),
  ('mcp-026', 'test-003', 1772429600000, 'mcp__figma__get_screenshot', 'interact', 0, 'rate_limit', NULL, NULL, 118, 'figma', 1000),
  ('mcp-027', 'test-003', 1772429610000, 'mcp__figma__get_screenshot', 'interact', 1, NULL, NULL, NULL, 119, 'figma', 2600),
  ('mcp-028', 'test-003', 1772429700000, 'mcp__vibe__vibe_chat', 'interact', 1, NULL, NULL, NULL, 120, 'vibe', 1400),
  ('mcp-029', 'test-003', 1772429800000, 'mcp__paymodel__paymodel_chat', 'interact', 1, NULL, NULL, NULL, 121, 'paymodel', 6000),
  ('mcp-030', 'test-003', 1772429900000, 'mcp__clara__wallet_dashboard', 'interact', 1, NULL, NULL, NULL, 122, 'clara', 2000);

-- Also update sessions to reflect MCP server usage
UPDATE sessions SET mcp_servers_used = '["clara","herd","figma","vibe","typefully"]' WHERE session_id = 'test-001';
UPDATE sessions SET mcp_servers_used = '["clara","herd","signal402","conway-terminal"]' WHERE session_id = 'test-002';
UPDATE sessions SET mcp_servers_used = '["clara","herd","glorp","figma","vibe","paymodel"]' WHERE session_id = 'test-003';

-- Update tool_use_count to include MCP events
UPDATE sessions SET tool_use_count = tool_use_count + 8 WHERE session_id = 'test-001';
UPDATE sessions SET tool_use_count = tool_use_count + 12 WHERE session_id = 'test-002';
UPDATE sessions SET tool_use_count = tool_use_count + 10 WHERE session_id = 'test-003';
