/**
 * Tokens — the manage-tokens screen (mirrors the design's TokensScreen). Lists
 * the ERC-20 tokens registered for the active account, each with its glyph and
 * mono contract address; built-in tokens can't be removed. A top-bar action and
 * the empty-state CTA both open the Add-token flow.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RegisteredToken } from '@tezosx/wallet-core/domain/token';
import { colors, fontSize, font, space } from '../theme';
import { truncAddr } from '../ui/format';
import { Icon } from '../ui/icon';
import { AssetMark } from '../ui/tx/AssetMark';
import { Btn } from '../ui/tx/Btn';
import { EmptyState } from '../ui/tx/EmptyState';
import { ErrorCard } from '../ui/tx/ErrorCard';
import { Spinner } from '../ui/tx/Spinner';
import { TopBar } from '../ui/tx/TopBar';
import { useWallet } from '../wallet/context';

export function Tokens(): React.JSX.Element {
  const ctx = useWallet();
  const tokensData = ctx.tokens;
  const tokens = tokensData.data ?? [];

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
        {tokensData.error != null && (
          <View style={styles.errWrap}>
            <ErrorCard title={tokensData.error.title} detail={tokensData.error.detail} />
          </View>
        )}
        {tokensData.loading && tokens.length === 0 ? (
          <View style={styles.loading}>
            <Spinner />
          </View>
        ) : tokens.length === 0 ? (
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

function TokenRow({ token }: { token: RegisteredToken }): React.JSX.Element {
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
  loading: { paddingTop: 48, alignItems: 'center' },
  errWrap: { paddingHorizontal: space[4], paddingTop: space[4] },
  addText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.fgMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 20 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: fontSize.md, fontWeight: '500', color: colors.fg },
  addr: { fontSize: fontSize.xs, color: colors.fgMuted, fontFamily: font.mono, marginTop: 2 },
});
