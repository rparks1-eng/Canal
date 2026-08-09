begin;

/*
 * SCENE_REVISION_CONFLICT is an expected optimistic-concurrency result,
 * not a PostgreSQL serialization failure. SQLSTATE 40001 invites database
 * and gateway transaction retries, turning one stale client write into a
 * request storm. Preserve the application error message/details while
 * returning the non-retryable PL/pgSQL application code P0001.
 */
do $$
declare
  target regprocedure;
  definition text;
begin
  foreach target in array array[
    'public.stamp_canal_scene_revision()'::regprocedure,
    'public.update_collaborative_scene(uuid,text,bigint,jsonb)'::regprocedure
  ]
  loop
    definition := pg_get_functiondef(target);

    if position('SCENE_REVISION_CONFLICT' in definition) = 0 then
      raise exception
        'Expected Scene revision conflict guard is missing from %.',
        target;
    end if;

    definition := replace(
      definition,
      'errcode = ''40001''',
      'errcode = ''P0001'''
    );

    execute definition;
  end loop;
end;
$$;

commit;
