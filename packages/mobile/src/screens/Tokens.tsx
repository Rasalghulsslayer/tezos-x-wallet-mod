/**
 * Tokens — the manage-tokens screen (mirrors the design's TokensScreen). Lists
 * the ERC-20 tokens registered for the active account, each with its glyph and
 * mono contract address; built-in tokens can't be removed. A top-bar action and
 * the empty-state CTA both open the Add-token flow.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, font } from '../theme';
import { truncAddr } from '../ui/format';
import { Icon } from '../ui/icon';
import { AssetMark } from '../ui/tx/AssetMark';
import { Btn } from '../ui/tx/Btn';
import { EmptyState } from '../ui/tx/EmptyState';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';
import type { MockToken } from '../mocks';

export function Tokens(): React.JSX.Element {
  const ctx = useWallet();
  const tokens = ctx.tokens(ctx.activeAccount.id);

  return (
    <View style={styles.screen}>
      <TopBar
        title="Manage tokens"
        onBack={() => ctx.nav.back()}
        right={
          <Btn variant="ghost" size="sm" onPress={() => ctx.nav.push('addToken')}>
            <Icon name="plus" size={15} color={colors.fgMuted} />
            <Text style={styles.addText}>Add</Text>
          </Btn>
        }
      />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {tokens.length === 0 ? (
          <EmptyState
            icon={<Icon name="plus" size={22} color={colors.fgMuted} />}
            title="No tokens yet"
            detail="Add an ERC-20 contract address to surface its balance on Home and its transfers in Activity."
            action={{ label: 'Add token', onPress: () => ctx.nav.push('addToken') }}
          />
        ) : (
          tokens.map((t) => <TokenRow key={t.address} token={t} />)
        )}
      </ScrollView>
    </View>
  );
}

function TokenRow({ token }: { token: MockToken }): React.JSX.Element {
  const ctx = useWallet();
  return (
    <View style={styles.row}>
      <AssetMark symbol={token.symbol} kind="token" size="sm" />
      <View style={styles.body}>
        <Text style={styles.name}>{token.symbol}</Text>
        <Text style={styles.addr}>{truncAddr(token.address, 8)}</Text>
      </View>
      <Btn
        variant="danger"
        size="sm"
        disabled={token.builtin === true}
        onPress={() => {
          ctx.removeToken(token.address);
          ctx.toast(`${token.symbol} removed`);
        }}
      >
        Remove
      </Btn>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  addText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.fgMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 20 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  addr: { fontSize: fontSize.xs, color: colors.fgMuted, fontFamily: font.mono, marginTop: 2 },
});
