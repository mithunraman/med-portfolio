import type { NoticeBlock } from '@acme/shared';
import { View, StyleSheet } from 'react-native';
import { LinksBlock } from './LinksBlock';
import { ParagraphBlock } from './ParagraphBlock';

interface Props {
  blocks: NoticeBlock[];
}

export function NoticeBlocks({ blocks }: Props) {
  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return <ParagraphBlock key={i} text={block.text} />;
          case 'links':
            return <LinksBlock key={i} items={block.items} />;
          default: {
            const _exhaustive: never = block;
            void _exhaustive;
            return null;
          }
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 20,
  },
});
