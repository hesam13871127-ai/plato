import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { ReversiPlay } from './Play';

const boardSkins: ShopSkin[] = [
  {
    id: 'reversi-classic',
    gameId: 'reversi',
    kind: 'board',
    name: { fa: 'سبز کلاسیک', en: 'Classic Green' },
    price: 0,
    colors: { base: '#166534', rim: '#3f2d20' },
    Preview: BoardPreview('#166534', '#3f2d20'),
  },
  {
    id: 'reversi-ocean',
    gameId: 'reversi',
    kind: 'board',
    name: { fa: 'آبی اقیانوسی', en: 'Ocean Blue' },
    price: 280,
    colors: { base: '#1e40af', rim: '#1e293b' },
    Preview: BoardPreview('#1e40af', '#1e293b'),
  },
  {
    id: 'reversi-rose',
    gameId: 'reversi',
    kind: 'board',
    name: { fa: 'گلبهی', en: 'Rosewood' },
    price: 440,
    colors: { base: '#9f1239', rim: '#4c0519' },
    Preview: BoardPreview('#9f1239', '#4c0519'),
  },
];

function BoardPreview(base: string, rim: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 1.7, 1.9], fov: 44 }}>
      <mesh castShadow position={[0, 0.1, 0]}>
        <boxGeometry args={[1.6, 0.14, 1.6]} />
        <meshStandardMaterial color={rim} roughness={0.7} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.08, 0]}>
        <planeGeometry args={[1.5, 1.5]} />
        <meshStandardMaterial color={base} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[-0.3, 0.16, -0.3]}>
        <cylinderGeometry args={[0.14, 0.14, 0.05, 20]} />
        <meshStandardMaterial color="#18181b" roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0.3, 0.16, 0.3]}>
        <cylinderGeometry args={[0.14, 0.14, 0.05, 20]} />
        <meshStandardMaterial color="#f4f4f5" roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0.3, 0.16, -0.3]}>
        <cylinderGeometry args={[0.14, 0.14, 0.05, 20]} />
        <meshStandardMaterial color="#18181b" roughness={0.3} />
      </mesh>
      <mesh castShadow position={[-0.3, 0.16, 0.3]}>
        <cylinderGeometry args={[0.14, 0.14, 0.05, 20]} />
        <meshStandardMaterial color="#f4f4f5" roughness={0.3} />
      </mesh>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0.8, 1, 1.9], fov: 44 }}>
      <Spin speed={0.6}>
        <mesh castShadow>
          <boxGeometry args={[1.7, 0.16, 1.7]} />
          <meshStandardMaterial color="#3f2d20" roughness={0.7} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.085, 0]}>
          <planeGeometry args={[1.6, 1.6]} />
          <meshStandardMaterial color="#166534" roughness={0.85} />
        </mesh>
        {/* mid-flip discs */}
        <mesh castShadow position={[-0.38, 0.22, -0.38]} rotation-x={0.9}>
          <cylinderGeometry args={[0.17, 0.17, 0.06, 22]} />
          <meshStandardMaterial color="#18181b" roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh castShadow position={[0.38, 0.3, 0.38]} rotation-x={2.2}>
          <cylinderGeometry args={[0.17, 0.17, 0.06, 22]} />
          <meshStandardMaterial color="#f4f4f5" roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh castShadow position={[0.38, 0.16, -0.38]}>
          <cylinderGeometry args={[0.17, 0.17, 0.06, 22]} />
          <meshStandardMaterial color="#18181b" roughness={0.3} />
        </mesh>
        <mesh castShadow position={[-0.38, 0.16, 0.38]}>
          <cylinderGeometry args={[0.17, 0.17, 0.06, 22]} />
          <meshStandardMaterial color="#f4f4f5" roughness={0.3} />
        </mesh>
      </Spin>
    </MiniCanvas>
  );
}

export const reversiMeta: GameMeta = {
  id: 'reversi',
  names: { fa: 'ریورسی', en: 'Reversi' },
  tagline: { fa: 'دیسک بچین، خط بگیر، رنگ عوض کن!', en: 'Place, capture, flip!' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#22c55e',
  Logo,
  Play: ReversiPlay,
  skins: boardSkins,
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'در پایان بازی، هر کس دیسک‌های بیشتری روی تخته دارد برنده است. تخته ۸×۸ است و شروع کلاسیک با ۴ دیسک وسط.',
      },
      {
        title: 'حرکت قانونی',
        body: 'خانه‌های قابل بازی با حلقهٔ روشن نشان داده می‌شوند. حرکت باید خطی از دیسک‌های حریف را بین دو دیسک خودی ببندد — همهٔ آن خط برندهٔ تو رنگ می‌شود!',
      },
      {
        title: 'پاس خودکار',
        body: 'اگر حرکت قانونی نداشته باشی نوبتت خودکار رد می‌شود. وقتی هیچ بازیکنی حرکت نداشته باشد یا تخته پر شود بازی تمام می‌شود.',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: 'When the board fills up (or neither player can move), whoever holds more discs wins. Classic 8×8 board with the 4-disc opening.',
      },
      {
        title: 'Legal moves',
        body: 'Playable cells glow with a ring. Your move must sandwich a straight line of opponent discs between two of yours — the whole line flips to your colour!',
      },
      {
        title: 'Auto-pass',
        body: 'If you have no legal move your turn is skipped automatically. The game ends when neither side can move or the board is full.',
      },
    ],
  },
};
