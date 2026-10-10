import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.GZIPOutputStream;

/** Builds SDK and runtime inputs, without modifying either upstream archive. */
public final class BuildScannerOverlay {
    public static void main(String[] args) throws Exception {
        Map<String, String> classes = new LinkedHashMap<>();
        for (String name : new String[] { "java/util/Scanner", "java/util/InputMismatchException", "java/util/Iterator",
                "java/io/Closeable", "java/io/InputStreamReader", "java/io/InputStream",
                "java/io/StringReader", "java/io/Reader", "java/lang/Readable",
                "java/nio/charset/Charset", "java/util/regex/Pattern", "java/util/regex/Matcher" }) {
            int slash = name.lastIndexOf('/');
            classes.put(name, "org/teavm/classlib/" + name.substring(0, slash + 1) + "T" + name.substring(slash + 1));
        }
        try (DataOutputStream sdk = new DataOutputStream(new GZIPOutputStream(Files.newOutputStream(Path.of(args[1]))));
             DataOutputStream runtime = new DataOutputStream(new GZIPOutputStream(Files.newOutputStream(Path.of(args[2]))))) {
            for (String name : new String[] { "Scanner", "InputMismatchException" }) {
                byte[] source = Files.readAllBytes(Path.of(args[0], "java/util/" + name + ".class"));
                entry(sdk, "java/util/" + name + ".class", source);
                entry(runtime, "org/teavm/classlib/java/util/T" + name + ".class", remap(source, classes));
            }
        }
    }
    private static byte[] remap(byte[] source, Map<String, String> classes) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(source));
             DataOutputStream output = new DataOutputStream(bytes)) {
            output.writeInt(input.readInt());
            output.writeShort(input.readUnsignedShort());
            output.writeShort(input.readUnsignedShort());
            int count = input.readUnsignedShort();
            output.writeShort(count);
            for (int i = 1; i < count; i++) {
                int tag = input.readUnsignedByte();
                output.writeByte(tag);
                if (tag == 1) {
                    String value = input.readUTF();
                    String mapped = classes.get(value);
                    if (mapped != null) value = mapped;
                    else for (Map.Entry<String, String> entry : classes.entrySet()) {
                        value = value.replace("L" + entry.getKey() + ";", "L" + entry.getValue() + ";")
                                .replace("L" + entry.getKey() + "<", "L" + entry.getValue() + "<");
                    }
                    output.writeUTF(value);
                } else {
                    int length;
                    switch (tag) {
                        case 3: case 4: case 9: case 10: case 11: case 12: case 17: case 18: length = 4; break;
                        case 5: case 6: length = 8; i++; break;
                        case 7: case 8: case 16: case 19: case 20: length = 2; break;
                        case 15: length = 3; break;
                        default: throw new IOException("Unsupported constant pool tag: " + tag);
                    }
                    output.write(input.readNBytes(length));
                }
            }
            input.transferTo(output);
        }
        return bytes.toByteArray();
    }
    private static void entry(DataOutputStream output, String path, byte[] bytes) throws IOException {
        byte[] name = path.getBytes(StandardCharsets.UTF_8);
        output.writeShort(name.length);
        output.write(name);
        output.writeInt(bytes.length);
        output.write(bytes);
    }
}
