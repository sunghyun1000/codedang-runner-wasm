import java.util.*;
import java.io.*;
import java.math.*;
import java.util.regex.Pattern;

/** Shared unchanged fixture: run on JDK, patched JDK and browser TeaVM. */
public class Main {
    static void print(String name, Object... values) {
        StringBuilder line = new StringBuilder(name);
        for (Object value : values) line.append('|').append(value);
        System.out.println(line);
    }
    public static void main(String[] args) throws Exception {
        Locale.setDefault(Locale.US);
        Scanner s = new Scanner("  12 -2147483648 9223372036854775807 1.25 true 한글🙂\n");
        print("numbers", s.hasNextInt(), s.hasNextInt(), s.nextInt(), s.nextInt(), s.nextLong(), s.nextDouble(), s.nextBoolean(), s.next(), s.hasNext());
        s = new Scanner("7 5\r\n\r\nlast");
        print("mixed", s.nextInt(), s.hasNextInt(), s.nextInt(), "[" + s.nextLine() + "]", "[" + s.nextLine() + "]", s.hasNextLine(), s.hasNextLine(), s.nextLine(), s.hasNextLine());
        s = new Scanner("2147483648 nope 9");
        print("lookahead", s.hasNextInt(), s.hasNextLong());
        try { s.nextInt(); } catch (InputMismatchException e) { print("mismatch", s.next()); }
        try { s.nextLong(); } catch (InputMismatchException e) { print("bad-long", s.next()); }
        print("recovered", s.nextInt(), s.hasNextInt());
        try { s.next(); } catch (NoSuchElementException e) { print("end", "NoSuchElementException"); }
        s = new Scanner("ff -80 101 1,234 1,234.50");
        print("radix", s.hasNextInt(16), s.nextInt(16), s.nextByte(16), s.nextInt(2), s.nextInt(), s.nextDouble());
        s = new Scanner("١٢٣ １２３ +00042 0,123 12,34");
        print("unicode", s.nextInt(), s.nextInt(), s.nextInt(), s.hasNextInt(), s.next(), s.hasNextInt(), s.next());
        s = new Scanner("123456789012345678901234567890 -1.234e3 NaN Infinity -Infinity 2.5f");
        print("big", s.nextBigInteger(), s.nextBigDecimal().toPlainString(), s.nextDouble(), s.nextFloat(), s.nextDouble(), s.hasNextDouble(), s.next());
        s = new Scanner("a,,b,").useDelimiter(",");
        List<String> tokens = new ArrayList<>();
        while (s.hasNext()) tokens.add("[" + s.next() + "]");
        print("delimiter", tokens);
        s = new Scanner("abc 123");
        print("pattern", s.hasNext(Pattern.compile("[a-z]+")), s.next("[a-z]+"), s.hasNext("[0-9]+"), s.next(Pattern.compile("[0-9]+")));
        s = new Scanner("a\rb\r\nc\nd\u0085e\u2028f\u2029");
        tokens.clear(); while (s.hasNextLine()) tokens.add(s.nextLine()); print("lines", tokens);
        s = new Scanner("TRUE false maybe");
        print("boolean", s.hasNextBoolean(), s.nextBoolean(), s.nextBoolean(), s.hasNextBoolean());
        try { s.nextBoolean(); } catch (InputMismatchException e) { print("bad-boolean", s.next()); }
        s = new Scanner("42"); s.close(); s.close();
        try { s.hasNext(); } catch (IllegalStateException e) { print("closed", "IllegalStateException"); }
        s = new Scanner("1.234,5").useLocale(Locale.GERMANY); print("locale", s.nextDouble());
        s = new Scanner("ff 10").useRadix(16); print("reset", s.nextInt(), s.reset().radix(), s.nextInt());
        s = new Scanner("127 128 -32768 32768");
        print("bounds", s.nextByte(), s.hasNextByte(), s.nextShort(), s.nextShort(), s.hasNextShort(), s.nextInt());
        try { s.hasNextInt(1); } catch (IllegalArgumentException e) { print("bad-radix", "IllegalArgumentException"); }
        StringBuilder large = new StringBuilder();
        for (int i = 0; i < 6000; i++) large.append("1 ");
        s = new Scanner(large.toString()); int sum = 0; while (s.hasNextInt()) sum += s.nextInt(); print("large", sum);
        s = new Scanner(new StringReader("reader input")); print("reader", s.next(), s.next());
        s = new Scanner(new ByteArrayInputStream(new byte[] { (byte) 0xed, (byte) 0x95, (byte) 0x9c,
                (byte) 0xea, (byte) 0xb8, (byte) 0x80, 32, 52, 50 }), "UTF-8"); print("utf8-stream", s.next(), s.nextInt());
        s = new Scanner("   1\n"); print("line-lookahead", s.hasNextInt(), "[" + s.nextLine() + "]", s.hasNext());
        s = new Scanner("word"); print("partial-eof", s.hasNext(), s.next(), s.hasNext());
        s = new Scanner(" "); print("blank-eof", s.hasNext(), "[" + s.nextLine() + "]", s.hasNextLine());
        s = new Scanner("a,,b").useDelimiter(",+"); tokens.clear(); while (s.hasNext()) tokens.add(s.next()); print("regex-delimiter", tokens);
        s = new Scanner(new Reader() {
            public int read(char[] chars, int offset, int length) throws IOException { throw new IOException("read failure"); }
            public void close() {}
        }); print("io-error", s.hasNext(), s.ioException().getMessage());
    }
}
