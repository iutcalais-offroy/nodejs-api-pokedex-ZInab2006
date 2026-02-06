import YAML from 'yamljs'
import path from 'path'
import { existsSync } from 'fs'

// Déterminer le chemin vers le dossier docs
// En dev (tsx) : depuis src/docs
// En prod (compilé) : depuis dist/docs
let docsDir = path.join(__dirname, 'docs')
if (!existsSync(path.join(docsDir, 'swagger.config.yml'))) {
  // Si pas trouvé, essayer depuis src/docs (pour le dev avec tsx)
  docsDir = path.join(__dirname, '..', 'src', 'docs')
}

// Charger la configuration principale
const swaggerConfig = YAML.load(path.join(docsDir, 'swagger.config.yml'))

// Charger les documentations des modules
   const authDoc = YAML.load(path.join(docsDir, 'auth.doc.yml'))
const cardDoc = YAML.load(path.join(docsDir, 'card.doc.yml'))
const deckDoc = YAML.load(path.join(docsDir, 'deck.doc.yml'))

// Fusionner tous les paths
export const swaggerDocument = {
  ...swaggerConfig,
  paths: {
    ...authDoc.paths,
    ...cardDoc.paths,
    ...deckDoc.paths,
  },
}
