-- 0012 · Security advisor fix: pin the search path of the one helper that lacked it.
alter function public._unscored_items(jsonb, text, jsonb, text[]) set search_path = public;
