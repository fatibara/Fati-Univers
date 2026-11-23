/** Niveaux et matières habituels en Guinée, proposés en « configuration rapide » (modifiables ensuite). */
export const LEVEL_PRESETS: Record<'MATERNELLE' | 'PRIMAIRE' | 'COLLEGE' | 'LYCEE', { names: string[]; scale: number }> = {
  MATERNELLE: { names: ['Petite section', 'Moyenne section', 'Grande section'], scale: 10 },
  PRIMAIRE: { names: ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'], scale: 10 },
  COLLEGE: { names: ['7e année', '8e année', '9e année', '10e année'], scale: 20 },
  LYCEE: { names: ['11e année', '12e année', 'Terminale'], scale: 20 },
};

export const SUBJECT_PRESETS: Record<'MATERNELLE' | 'PRIMAIRE' | 'COLLEGE' | 'LYCEE', [string, string][]> = {
  MATERNELLE: [
    ['LANG', 'Langage'],
    ['EVEIL', 'Éveil'],
    ['DESS', 'Dessin'],
  ],
  PRIMAIRE: [
    ['FR', 'Français'],
    ['MATH', 'Mathématiques'],
    ['SCI', "Sciences d'observation"],
    ['HG', 'Histoire-Géographie'],
    ['ECM', 'Éducation civique et morale'],
    ['EPS', 'Éducation physique et sportive'],
  ],
  COLLEGE: [
    ['FR', 'Français'],
    ['MATH', 'Mathématiques'],
    ['ANG', 'Anglais'],
    ['HG', 'Histoire-Géographie'],
    ['SVT', 'Sciences de la vie et de la Terre'],
    ['PC', 'Physique-Chimie'],
    ['ECM', 'Éducation civique et morale'],
    ['EPS', 'Éducation physique et sportive'],
  ],
  LYCEE: [
    ['FR', 'Français'],
    ['MATH', 'Mathématiques'],
    ['ANG', 'Anglais'],
    ['HG', 'Histoire-Géographie'],
    ['SVT', 'Sciences de la vie et de la Terre'],
    ['PC', 'Physique-Chimie'],
    ['PHILO', 'Philosophie'],
    ['EPS', 'Éducation physique et sportive'],
  ],
};
