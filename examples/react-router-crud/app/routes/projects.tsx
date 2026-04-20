import { Form, useLoaderData } from 'react-router';
import { defineObjxAction, defineObjxLoader, mapObjxErrorToResponse } from '@qbobjx/fullstack';
import { Project } from '../lib/models';
import { session } from '../lib/objx.server';

type ProjectRow = {
  id: number;
  name: string;
  status: string;
  createdAt?: string;
};

const baseLoader = defineObjxLoader(session, async () => {
  const rows = await session.execute(
    Project.query().orderBy(({ id }) => id, 'desc'),
    {
      hydrate: true,
    },
  );

  return Response.json({
    data: rows as readonly ProjectRow[],
  });
});

export async function loader(args: { request: Request }) {
  return baseLoader(args);
}

const baseAction = defineObjxAction(session, async ({ request }) => {
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? 'create');

  if (intent === 'create') {
    const name = String(formData.get('name') ?? '').trim();
    const status = String(formData.get('status') ?? 'planned').trim();

    if (!name) {
      return Response.json(
        { error: 'name_required', message: 'Provide a project name.' },
        { status: 400 },
      );
    }

    await session.insertGraph(Project, {
      name,
      status: status || 'planned',
    });

    return new Response(null, {
      status: 303,
      headers: {
        location: '/',
      },
    });
  }

  if (intent === 'update') {
    const id = Number.parseInt(String(formData.get('id') ?? ''), 10);
    const status = String(formData.get('status') ?? '').trim();

    if (!Number.isInteger(id) || id <= 0 || !status) {
      return Response.json(
        { error: 'invalid_update_payload', message: 'Provide a valid id and status.' },
        { status: 400 },
      );
    }

    await session.execute(
      Project.update({ status }).where(({ id: projectId }, op) => op.eq(projectId, id)),
    );

    return new Response(null, {
      status: 303,
      headers: {
        location: '/',
      },
    });
  }

  if (intent === 'delete') {
    const id = Number.parseInt(String(formData.get('id') ?? ''), 10);

    if (!Number.isInteger(id) || id <= 0) {
      return Response.json(
        { error: 'invalid_delete_payload', message: 'Provide a valid project id.' },
        { status: 400 },
      );
    }

    await session.execute(Project.delete().where(({ id: projectId }, op) => op.eq(projectId, id)));

    return new Response(null, {
      status: 303,
      headers: {
        location: '/',
      },
    });
  }

  return Response.json(
    { error: 'invalid_intent', message: 'Unknown action intent.' },
    { status: 400 },
  );
});

export async function action(args: { request: Request }) {
  try {
    return await baseAction(args);
  } catch (error) {
    return mapObjxErrorToResponse(error) ??
      Response.json(
        { error: 'internal_error', message: 'Unexpected failure.' },
        { status: 500 },
      );
  }
}

export default function ProjectsPage() {
  const payload = useLoaderData<typeof loader>() as { data: readonly ProjectRow[] };

  return (
    <main style={{ maxWidth: 760, margin: '2rem auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1>OBJX + React Router CRUD</h1>
      <p>Simple CRUD using <code>loader</code>/<code>action</code> and <code>@qbobjx/fullstack</code>.</p>

      <section style={{ marginTop: 24 }}>
        <h2>Create project</h2>
        <Form method="post" style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <input type="hidden" name="intent" value="create" />
          <input name="name" placeholder="Project name" required />
          <select name="status" defaultValue="planned">
            <option value="planned">planned</option>
            <option value="doing">doing</option>
            <option value="done">done</option>
          </select>
          <button type="submit">Create</button>
        </Form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Projects</h2>
        {payload.data.length === 0 ? (
          <p>No projects yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
            {payload.data.map((project) => (
              <li key={project.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
                <strong>#{project.id}</strong> {project.name} — <em>{project.status}</em>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <Form method="post" style={{ display: 'flex', gap: 8 }}>
                    <input type="hidden" name="intent" value="update" />
                    <input type="hidden" name="id" value={project.id} />
                    <select name="status" defaultValue={project.status}>
                      <option value="planned">planned</option>
                      <option value="doing">doing</option>
                      <option value="done">done</option>
                    </select>
                    <button type="submit">Update status</button>
                  </Form>

                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={project.id} />
                    <button type="submit">Delete</button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
