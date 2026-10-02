import { expect, test } from 'bun:test'
import { Glob } from 'bun'

// WEB-189: antes da hidratação um <form> sem `method` faz GET nativo e põe os
// campos (senha, e-mail) na URL. Todo <form> do app abre com method="post".
test('todo <form> do app tem method="post"', async () => {
  const semPost: string[] = []
  for await (const file of new Glob('**/*.tsx').scan(import.meta.dir)) {
    const source = await Bun.file(`${import.meta.dir}/${file}`).text()
    if (/<form(?=[\s>])(?!\s+method="post")/.test(source)) semPost.push(file)
  }
  expect(semPost).toEqual([])
})
