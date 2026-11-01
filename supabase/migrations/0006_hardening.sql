-- Security advisor follow-up.
-- 1. Fixed search_path on the remaining functions.
alter function _require(boolean, text) set search_path = public;
alter function working_days_between(timestamptz, timestamptz) set search_path = public;
alter function period_bounds(text) set search_path = public;
alter function period_of(date) set search_path = public;
alter function _score_subject(jsonb, text, jsonb, text[]) set search_path = public;

-- 2. Internal helpers (underscore names) are not part of the API.
--    They are only called from other security-definer functions, which run as the owner.
--    Policy helpers (me, has_role, can_see_* …) stay executable: row-level security calls them as the user.
revoke execute on function
  _can_qa(uuid, text, text), _can_staff(uuid), _people_with_role(text), _pipeline_step_allowed(text, text),
  _rotate_assignee(uuid, text, text), _score_mock(jsonb, text[]), _segment_owners(text), _setting(text),
  _team_role(uuid, uuid, uuid), _template_for(text, text), _require(boolean, text), _score_subject(jsonb, text, jsonb, text[])
from authenticated;
