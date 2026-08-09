begin;

alter table public.live_stage_message_reactions
drop constraint if exists live_stage_message_reactions_reaction_check;

update public.live_stage_message_reactions
set reaction = case reaction
  when 'heart' then '❤️'
  when 'applause' then '👍'
  when 'spark' then '✨'
  else reaction
end
where reaction in ('heart', 'applause', 'spark');

alter table public.live_stage_message_reactions
add constraint live_stage_message_reactions_reaction_unicode_bounds check (
  char_length(reaction) between 1 and 16
  and octet_length(reaction) <= 64
  and reaction !~ '[[:cntrl:][:space:][:alnum:]]'
);

create or replace function private.limit_live_stage_message_reactions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    select count(*) >= 12
    from public.live_stage_message_reactions
    where message_id = new.message_id and user_id = new.user_id
  ) then
    raise exception 'A listener can add up to 12 reactions per message.' using errcode = 'check_violation';
  end if;

  if (
    select count(distinct reaction) >= 24
    from public.live_stage_message_reactions
    where message_id = new.message_id
  ) then
    raise exception 'A message can have up to 24 different reactions.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists live_stage_message_reactions_limit on public.live_stage_message_reactions;
create trigger live_stage_message_reactions_limit
before insert on public.live_stage_message_reactions
for each row execute function private.limit_live_stage_message_reactions();

commit;
