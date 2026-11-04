import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// API lint (api/, server/). The frontend has its own config in web/.
export default tseslint.config(
  { ignores: ['web/**', 'node_modules/**', 'supabase/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
)
